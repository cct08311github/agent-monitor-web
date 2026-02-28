const express = require('express');
const router = express.Router();
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');

const OPENCLAW_BIN = path.join(os.homedir(), '.openclaw', 'bin', 'openclaw');

const agentController = require('../controllers/agentController');
const securityController = require('../controllers/securityController');
const complianceController = require('../controllers/complianceController');
const systemController = require('../controllers/systemController');
const cronController = require('../controllers/cronController');
const legacyDashboardController = require('../controllers/legacyDashboardController');
const legacyControlController = require('../controllers/legacyControlController');
const auth = require('../middlewares/auth');

// Legacy Read Endpoints
router.get('/read/health', (req, res) => res.json({ success: true, ts: new Date().toISOString() }));
router.get('/read/dashboard', legacyDashboardController.getDashboard);
router.get('/read/stream', legacyDashboardController.streamDashboard);
router.get('/read/history', legacyDashboardController.getHistory);
router.get('/read/status', legacyDashboardController.getStatus);
router.get('/read/models', legacyDashboardController.getModels);
router.get('/read/agents', legacyDashboardController.getAgents);
router.get('/dashboard', legacyDashboardController.getDashboard); // very legacy

// Cron Jobs
router.get('/cron/jobs', cronController.getJobs);
router.post('/cron/jobs/:id/toggle', auth.localhostOnlyControl, auth.rateLimit, cronController.toggleJob);
router.post('/cron/jobs/:id/run', auth.localhostOnlyControl, auth.rateLimit, cronController.runJob);

// Legacy Control Endpoints
const controlRouter = express.Router();
controlRouter.use(auth.controlAuditMiddleware);
controlRouter.use(auth.localhostOnlyControl);
controlRouter.use(auth.rateLimit);
controlRouter.use(auth.requireBearerToken);

controlRouter.post('/command', legacyControlController.runCommand);
router.use('/control', controlRouter);

// Dashboard UI command endpoint — no bearer token required (same-origin, localhost-only)
router.post('/command', auth.localhostOnlyControl, auth.rateLimit, legacyControlController.runCommand);

// Agents
router.get('/agents', agentController.getAgents);

// Security & Threats
router.post('/threats/analyze', securityController.analyzeThreats);
router.post('/security/analyze', securityController.analyzeSecurity);
router.get('/learn/search', securityController.searchAndLearn);

// Compliance
router.post('/compliance/analyze', complianceController.analyzeCompliance);
router.get('/compliance/status', complianceController.getComplianceStatus);

// System Health
router.get('/system/comprehensive', systemController.getComprehensiveStatus);
router.get('/health', systemController.getHealth);

// Gateway Watchdog
const gatewayWatchdog = require('../services/gatewayWatchdog');

router.get('/watchdog/status', (req, res) => {
    res.json({ success: true, watchdog: gatewayWatchdog.getStatus() });
});

router.post('/watchdog/repair', auth.localhostOnlyControl, auth.rateLimit, async (req, res) => {
    try {
        const result = await gatewayWatchdog.triggerRepair();
        res.json({ success: true, repaired: result });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

router.post('/watchdog/toggle', auth.localhostOnlyControl, auth.rateLimit, (req, res) => {
    const enabled = req.body?.enabled;
    if (enabled) {
        gatewayWatchdog.start();
    } else {
        gatewayWatchdog.stop();
    }
    res.json({ success: true, watchdog: gatewayWatchdog.getStatus() });
});

// OpenClaw Logs Streaming (SSE)
// Streams `openclaw logs --follow` output as Server-Sent Events
router.get('/logs/stream', auth.localhostOnlyControl, (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
    });

    // Send a heartbeat comment every 20s to keep connection alive
    const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 20000);

    // NOTE: `openclaw logs` tails the Gateway log file. In some environments that file
    // may contain large structured JSON dumps (e.g. cron jobs listing that *looks like*
    // jobs.json). Those dumps drown out the realtime logs in the UI, so we suppress them.
    const child = spawn(OPENCLAW_BIN, ['logs', '--follow', '--plain'], {
        env: { ...process.env, FORCE_COLOR: '0' },
        stdio: ['ignore', 'pipe', 'pipe']
    });

    // Suppress large cron-jobs JSON dumps that start with a { ... "jobs": [...] ... }
    // block and can span hundreds of lines.
    let suppressJobsJson = false;

    function shouldStartJobsSuppress(trimmed) {
        return trimmed.includes('\"jobs\": [') || trimmed.includes("'jobs': [") || /^\s*\"jobs\"\s*:\s*\[/.test(trimmed);
    }

    function sendLine(line) {
        const trimmed = line.trimEnd();
        if (!trimmed) return;

        if (!suppressJobsJson && shouldStartJobsSuppress(trimmed)) {
            suppressJobsJson = true;
            res.write(`data: ${JSON.stringify({ line: '[cron jobs JSON dump suppressed]', ts: Date.now() })}\n\n`);
            return;
        }

        if (suppressJobsJson) {
            // End suppression when the JSON object closes.
            if (trimmed === '}' || trimmed === '},' || trimmed === '}]' || trimmed === ']}' || trimmed === ']') {
                suppressJobsJson = false;
            }
            return;
        }

        // SSE format: data: <payload>\n\n
        res.write(`data: ${JSON.stringify({ line: trimmed, ts: Date.now() })}\n\n`);
    }

    let stdoutBuf = '';
    child.stdout.on('data', (chunk) => {
        stdoutBuf += chunk.toString();
        const lines = stdoutBuf.split('\n');
        stdoutBuf = lines.pop(); // keep incomplete last line
        lines.forEach(sendLine);
    });

    let stderrBuf = '';
    child.stderr.on('data', (chunk) => {
        stderrBuf += chunk.toString();
        const lines = stderrBuf.split('\n');
        stderrBuf = lines.pop();
        lines.forEach(sendLine);
    });

    child.on('close', (code) => {
        clearInterval(heartbeat);
        res.write(`data: ${JSON.stringify({ line: `[openclaw logs exited: code ${code}]`, ts: Date.now() })}\n\n`);
        res.end();
    });

    child.on('error', (err) => {
        clearInterval(heartbeat);
        res.write(`data: ${JSON.stringify({ line: `[Error spawning openclaw: ${err.message}]`, ts: Date.now() })}\n\n`);
        res.end();
    });

    req.on('close', () => {
        clearInterval(heartbeat);
        try { child.kill('SIGTERM'); } catch (_) { }
    });
});

module.exports = router;
