const express = require('express');
const router = express.Router();
const { getOpenClawConfig } = require('../config');
const openclawClient = require('../services/openclawClient');
const AppError = require('../utils/appError');
const { sendOk } = require('../utils/apiResponse');

const agentController = require('../controllers/agentController');
const securityController = require('../controllers/securityController');
const complianceController = require('../controllers/complianceController');
const systemController = require('../controllers/systemController');
const cronController = require('../controllers/cronController');
const taskHubController = require('../controllers/taskHubController');
const dashboardReadController = require('../controllers/dashboardReadController');
const optimizeController = require('../controllers/optimizeController');
const controlController = require('../controllers/controlController');
const auth = require('../middlewares/auth');
const alertController = require('../controllers/alertController');
const authController = require('../controllers/authController');
const { csrfTokenGenerator, csrfVerifier } = require('../middlewares/csrfProtection');
const { validateAgentId, validateSessionId, validateDomain } = require('../middlewares/inputValidation');

// ── Public Endpoints (no auth required) ───────────────────────────────────────
router.get('/read/health', (req, res) => sendOk(res, { ts: new Date().toISOString() }));
router.get('/read/liveness', systemController.getLiveness);
router.get('/read/readiness', systemController.getReadiness);
router.get('/read/dependencies', systemController.getDependencies);

// Auth endpoints — must be public (before requireAuth)
router.post('/auth/login', auth.loginRateLimit, authController.login);
router.post('/auth/logout', authController.logout);
router.get('/auth/me', authController.me);

// Legacy Control Endpoints (have own bearer-token auth, must be before requireAuth)
const controlRouter = express.Router();
controlRouter.use(auth.controlAuditMiddleware);
controlRouter.use(auth.localhostOnlyControl);
controlRouter.use(auth.rateLimit);
controlRouter.use(auth.requireBearerToken);

controlRouter.post('/command', controlController.runCommand);
router.use('/control', controlRouter);

// ── Session Auth (protects all routes below) ──────────────────────────────────
router.use(auth.requireAuth);

// Generate CSRF token for authenticated sessions
router.use(csrfTokenGenerator);

// Alerts
router.get('/alerts/config', alertController.getConfig);
router.patch('/alerts/config', auth.localhostOnlyControl, auth.rateLimit, csrfVerifier, alertController.updateConfig);
router.get('/alerts/recent', alertController.getRecent);
router.get('/read/dashboard', dashboardReadController.getDashboard);
router.get('/read/stream', dashboardReadController.streamDashboard);
router.get('/read/history', dashboardReadController.getHistory);
router.get('/read/status', dashboardReadController.getStatus);
router.get('/read/models', dashboardReadController.getModels);
router.get('/read/agents', dashboardReadController.getAgents);
router.get('/agents/:agentId/sessions', validateAgentId, dashboardReadController.getSessions);
router.get('/agents/:agentId/sessions/:sessionId', validateAgentId, validateSessionId, dashboardReadController.getSessionContent);
router.get('/dashboard', dashboardReadController.getDashboard); // very legacy

// Optimize
router.get('/optimize/run', auth.localhostOnlyControl, auth.rateLimit, optimizeController.run);

// TaskHub
router.get('/taskhub/stats', taskHubController.getStats);
router.get('/taskhub/tasks', taskHubController.getTasks);
router.post('/taskhub/tasks', auth.localhostOnlyControl, auth.rateLimit, csrfVerifier, taskHubController.createTask);
router.patch('/taskhub/tasks/:domain/:id', validateDomain, auth.localhostOnlyControl, auth.rateLimit, csrfVerifier, taskHubController.updateTask);
router.delete('/taskhub/tasks/:domain/:id', validateDomain, auth.localhostOnlyControl, auth.rateLimit, csrfVerifier, taskHubController.deleteTask);

// Cron Jobs
router.get('/cron/jobs', cronController.getJobs);
router.post('/cron/jobs/:id/toggle', auth.localhostOnlyControl, auth.rateLimit, csrfVerifier, cronController.toggleJob);
router.post('/cron/jobs/:id/run', auth.localhostOnlyControl, auth.rateLimit, csrfVerifier, cronController.runJob);
router.delete('/cron/jobs/:id', auth.localhostOnlyControl, auth.rateLimit, csrfVerifier, cronController.deleteJob);

// Dashboard UI command endpoint — localhost-only, session-auth protected
router.post('/command', auth.localhostOnlyControl, auth.rateLimit, csrfVerifier, controlController.runCommand);

// Agents
router.get('/agents', agentController.getAgents);

// Security & Threats
router.post('/threats/analyze', csrfVerifier, securityController.analyzeThreats);
router.post('/security/analyze', csrfVerifier, securityController.analyzeSecurity);
router.get('/learn/search', securityController.searchAndLearn);

// Compliance
router.post('/compliance/analyze', csrfVerifier, complianceController.analyzeCompliance);
router.get('/compliance/status', complianceController.getComplianceStatus);

// System Health
router.get('/system/comprehensive', systemController.getComprehensiveStatus);
router.get('/health', systemController.getHealth);

// Gateway Watchdog
const gatewayWatchdog = require('../services/gatewayWatchdog');

router.get('/watchdog/status', (req, res) => {
    return sendOk(res, { watchdog: gatewayWatchdog.getStatus() });
});

router.post('/watchdog/repair', auth.localhostOnlyControl, auth.rateLimit, csrfVerifier, async (req, res, next) => {
    try {
        const result = await gatewayWatchdog.triggerRepair();
        return sendOk(res, { repaired: result });
    } catch (e) {
        return next(new AppError(500, 'repair_failed', e.message));
    }
});

router.post('/watchdog/toggle', auth.localhostOnlyControl, auth.rateLimit, csrfVerifier, (req, res) => {
    const enabled = req.body?.enabled;
    if (typeof enabled !== 'boolean') {
        throw new AppError(400, 'invalid_enabled', 'enabled must be boolean');
    }
    if (enabled) {
        gatewayWatchdog.start();
    } else {
        gatewayWatchdog.stop();
    }
    return sendOk(res, { watchdog: gatewayWatchdog.getStatus() });
});

// Feature Flags (localhost-only for security)
router.get('/flags', auth.localhostOnlyControl, (req, res) => {
    return sendOk(res, auth.getStats());
});

router.patch('/flags/:name', auth.localhostOnlyControl, auth.rateLimit, csrfVerifier, (req, res) => {
    const { name } = req.params;
    const { enabled, description } = req.body || {};
    if (typeof enabled !== 'boolean') {
        throw new AppError(400, 'invalid_flag_update', 'enabled must be boolean');
    }
    const updated = auth.updateFlag(name, { enabled, description });
    if (!updated) {
        throw new AppError(404, 'flag_not_found', `Feature flag '${name}' not found`);
    }
    return sendOk(res, { flag: auth.getFlag(name) });
});

// Plugin Registry (localhost-only for security)
router.get('/plugins', auth.localhostOnlyControl, (req, res) => {
    const pluginRegistry = require('../services/pluginRegistry');
    return sendOk(res, pluginRegistry.getStats());
});

router.post('/plugins/:name/toggle', auth.localhostOnlyControl, auth.rateLimit, csrfVerifier, (req, res) => {
    const { name } = req.params;
    const pluginRegistry = require('../services/pluginRegistry');
    const plugin = pluginRegistry.getPlugin(name);
    if (!plugin) {
        throw new AppError(404, 'plugin_not_found', `Plugin '${name}' not found`);
    }
    const enabled = plugin.enabled;
    if (enabled) {
        pluginRegistry.disablePlugin(name);
    } else {
        pluginRegistry.enablePlugin(name);
    }
    return sendOk(res, { plugin: pluginRegistry.getPlugin(name) });
});

// OpenClaw Logs Streaming (SSE)
// Streams `openclaw logs --follow` output as Server-Sent Events
/* istanbul ignore next */
router.get('/logs/stream', auth.localhostOnlyControl, /* istanbul ignore next */ (req, res) => {
    const { binPath } = getOpenClawConfig();
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
    const child = openclawClient.spawnArgs(['logs', '--follow', '--plain'], {
        binPath,
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
        try { child.kill('SIGTERM'); } catch (_) { /* process already exited */ }
    });
});

module.exports = router;
