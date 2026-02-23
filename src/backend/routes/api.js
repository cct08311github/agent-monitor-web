const express = require('express');
const router = express.Router();

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

module.exports = router;
