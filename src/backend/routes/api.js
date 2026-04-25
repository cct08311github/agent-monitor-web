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
const { authLimiter } = require('../middlewares/rateLimiter');
const { validateAgentId, validateSessionId, validateDomain, validateTaskId } = require('../middlewares/inputValidation');

// ── Public Endpoints (no auth required) ───────────────────────────────────────
router.get('/read/health', (req, res) => sendOk(res, { ts: new Date().toISOString() }));

// Auth endpoints — must be public (before requireAuth)
router.post('/auth/login', authLimiter, auth.loginRateLimit, authController.login);
// Logout stays before requireAuth so expired-session users can still clear cookies.
// Lightweight CSRF: require _csrfSecret cookie presence (not full token validation).
// Real CSRF protection is SameSite=Strict on the sid cookie.
router.post('/auth/logout', (req, res, next) => {
    if (!req.cookies?._csrfSecret && process.env.AUTH_DISABLED !== 'true') {
        return res.status(403).json({ success: false, error: 'csrf_missing' });
    }
    next();
}, authController.logout);
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

// Liveness/readiness/dependencies require auth (expose pid, filesystem paths)
router.get('/read/liveness', systemController.getLiveness);
router.get('/read/readiness', systemController.getReadiness);
router.get('/read/dependencies', systemController.getDependencies);

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
router.get('/read/metrics', dashboardReadController.getMetrics.bind(dashboardReadController));
router.get('/read/errors/recent', dashboardReadController.getRecentErrors.bind(dashboardReadController));
router.get('/agents/:agentId/sessions', validateAgentId, dashboardReadController.getSessions);
router.get('/agents/:agentId/sessions/:sessionId', validateAgentId, validateSessionId, dashboardReadController.getSessionContent);
router.get('/dashboard', dashboardReadController.getDashboard); // very legacy

// Optimize
router.get('/optimize/run', auth.localhostOnlyControl, auth.rateLimit, optimizeController.run);
router.get('/optimize/history', optimizeController.getHistory.bind(optimizeController));
router.get('/optimize/result/:filename', optimizeController.getResult.bind(optimizeController));

// TaskHub
router.get('/taskhub/stats', taskHubController.getStats);
router.get('/taskhub/tasks', taskHubController.getTasks);
router.post('/taskhub/tasks', auth.localhostOnlyControl, auth.rateLimit, csrfVerifier, taskHubController.createTask);
router.patch('/taskhub/tasks/:domain/:id', validateDomain, validateTaskId, auth.localhostOnlyControl, auth.rateLimit, csrfVerifier, taskHubController.updateTask);
router.delete('/taskhub/tasks/:domain/:id', validateDomain, validateTaskId, auth.localhostOnlyControl, auth.rateLimit, csrfVerifier, taskHubController.deleteTask);

// Cron Jobs
router.get('/cron/jobs', cronController.getJobs);
router.post('/cron/jobs/:id/toggle', validateTaskId, auth.localhostOnlyControl, auth.rateLimit, csrfVerifier, cronController.toggleJob);
router.post('/cron/jobs/:id/run', validateTaskId, auth.localhostOnlyControl, auth.rateLimit, csrfVerifier, cronController.runJob);
router.delete('/cron/jobs/:id', validateTaskId, auth.localhostOnlyControl, auth.rateLimit, csrfVerifier, cronController.deleteJob);

// Dashboard UI command endpoint — localhost-only, session-auth protected
router.post('/command', auth.localhostOnlyControl, auth.rateLimit, csrfVerifier, controlController.runCommand);

// Agents
router.get('/agents', agentController.getAgents);

// Security & Threats
router.post('/threats/analyze', auth.rateLimit, csrfVerifier, securityController.analyzeThreats);
router.post('/security/analyze', auth.rateLimit, csrfVerifier, securityController.analyzeSecurity);
router.get('/learn/search', auth.rateLimit, securityController.searchAndLearn);

// Compliance
router.post('/compliance/analyze', auth.rateLimit, csrfVerifier, complianceController.analyzeCompliance);
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

router.post('/watchdog/toggle', auth.localhostOnlyControl, auth.rateLimit, csrfVerifier, (req, res, next) => {
    try {
        const enabled = req.body?.enabled;
        if (typeof enabled !== 'boolean') {
            return next(new AppError(400, 'invalid_enabled', 'enabled must be boolean'));
        }
        if (enabled) {
            gatewayWatchdog.start();
        } else {
            gatewayWatchdog.stop();
        }
        return sendOk(res, { watchdog: gatewayWatchdog.getStatus() });
    } catch (e) {
        return next(e);
    }
});

// Feature Flags (localhost-only for security)
router.get('/flags', auth.localhostOnlyControl, (req, res) => {
    return sendOk(res, auth.getStats());
});

router.patch('/flags/:name', auth.localhostOnlyControl, auth.rateLimit, csrfVerifier, (req, res, next) => {
    try {
        const { name } = req.params;
        if (!/^[a-zA-Z0-9_-]{1,64}$/.test(name)) return next(new AppError(400, 'invalid_flag_name', 'Invalid flag name'));
        const { enabled, description } = req.body || {};
        if (typeof enabled !== 'boolean') {
            return next(new AppError(400, 'invalid_flag_update', 'enabled must be boolean'));
        }
        const updated = auth.updateFlag(name, { enabled, description });
        if (!updated) {
            return next(new AppError(404, 'flag_not_found', `Feature flag '${name}' not found`));
        }
        return sendOk(res, { flag: auth.getFlag(name) });
    } catch (e) {
        return next(e);
    }
});

// Plugin Registry (localhost-only for security)
router.get('/plugins', auth.localhostOnlyControl, (req, res) => {
    const pluginRegistry = require('../services/pluginRegistry');
    return sendOk(res, pluginRegistry.getStats());
});

router.post('/plugins/:name/toggle', auth.localhostOnlyControl, auth.rateLimit, csrfVerifier, (req, res, next) => {
    try {
        const { name } = req.params;
        if (!/^[a-zA-Z0-9_-]{1,64}$/.test(name)) return next(new AppError(400, 'invalid_plugin_name', 'Invalid plugin name'));
        const pluginRegistry = require('../services/pluginRegistry');
        const plugin = pluginRegistry.getPlugin(name);
        if (!plugin) {
            return next(new AppError(404, 'plugin_not_found', `Plugin '${name}' not found`));
        }
        const enabled = plugin.enabled;
        if (enabled) {
            pluginRegistry.disablePlugin(name);
        } else {
            pluginRegistry.enablePlugin(name);
        }
        return sendOk(res, { plugin: pluginRegistry.getPlugin(name) });
    } catch (e) {
        return next(e);
    }
});

// OpenClaw Logs Streaming (SSE)
// Streams `openclaw logs --follow` output as Server-Sent Events
const activeLogStreams = new Map(); // res → child
const MAX_LOGS_STREAM_CLIENTS = 5;
/* istanbul ignore next */
router.get('/logs/stream', auth.requireAuth, auth.localhostOnlyControl, /* istanbul ignore next */ (req, res) => {
    if (activeLogStreams.size >= MAX_LOGS_STREAM_CLIENTS) {
        return res.status(503).json({ success: false, error: 'logs_stream_capacity_exceeded' });
    }
    activeLogStreams.set(res, null); // child assigned after spawn
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
    activeLogStreams.set(res, child);

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
        if (stdoutBuf.length > 64 * 1024) stdoutBuf = stdoutBuf.slice(-32 * 1024);
        const lines = stdoutBuf.split('\n');
        stdoutBuf = lines.pop(); // keep incomplete last line
        lines.forEach(sendLine);
    });

    let stderrBuf = '';
    child.stderr.on('data', (chunk) => {
        stderrBuf += chunk.toString();
        if (stderrBuf.length > 64 * 1024) stderrBuf = stderrBuf.slice(-32 * 1024);
        const lines = stderrBuf.split('\n');
        stderrBuf = lines.pop();
        lines.forEach(sendLine);
    });

    let cleaned = false;
    function cleanup() {
        if (cleaned) return;
        cleaned = true;
        activeLogStreams.delete(res);
        clearInterval(heartbeat);
        try { child.kill('SIGTERM'); } catch (_) { /* process already exited */ }
    }

    child.on('close', (code) => {
        cleanup();
        try {
            res.write(`data: ${JSON.stringify({ line: `[openclaw logs exited: code ${code}]`, ts: Date.now() })}\n\n`);
            res.end();
        } catch (_) { /* client already disconnected */ }
    });

    child.on('error', (err) => {
        cleanup();
        try {
            res.write(`data: ${JSON.stringify({ line: `[Error spawning openclaw: ${err.message}]`, ts: Date.now() })}\n\n`);
            res.end();
        } catch (_) { /* client already disconnected */ }
    });

    req.on('close', () => {
        cleanup();
    });
});

/* istanbul ignore next */
router.closeAllLogStreams = function closeAllLogStreams() {
    for (const [res, child] of activeLogStreams) {
        try { if (child) child.kill('SIGTERM'); } catch (_) {}
        try { res.end(); } catch (_) {}
    }
    activeLogStreams.clear();
};

module.exports = router;
