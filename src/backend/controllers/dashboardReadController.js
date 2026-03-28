const { ok, fail } = require('../utils/apiResponse');
const { getHistoryPayload } = require('../services/historyService');
const sessionReadService = require('../services/sessionReadService');
const dashboardPayloadService = require('../services/dashboardPayloadService');

class DashboardReadController {
    async getDashboard(req, res) {
        try {
            if (req.query.force === '1') {
                dashboardPayloadService.invalidateSharedPayload();
            }
            if (dashboardPayloadService.shouldRefreshSharedPayload(5000)) {
                await dashboardPayloadService.updateSharedData();
            }
            res.json(dashboardPayloadService.getSharedPayload());
        } catch (error) { /* istanbul ignore next */
            res.status(500).json(fail(error.message));
        }
    }

    async getHistory(req, res) {
        try {
            res.json(getHistoryPayload());
        } catch (error) { /* istanbul ignore next */
            res.status(500).json(fail(error.message));
        }
    }

    async streamDashboard(req, res) {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        });

        dashboardPayloadService.addSseClient(res);
        dashboardPayloadService.startGlobalPolling();
        dashboardPayloadService.startSseHeartbeat();

        /* istanbul ignore next */
        if (dashboardPayloadService.getSharedPayload()) {
            res.write(`data: ${JSON.stringify(dashboardPayloadService.getSharedPayload())}\n\n`);
        }

        req.on('close', () => {
            dashboardPayloadService.removeSseClient(res);
        });
    }

    async getStatus(req, res) {
        try {
            const { stdout, stderr } = await dashboardPayloadService.runOpenclawRead(['status']);
            res.json(ok({ output: (stdout || '') + (stderr || '') }));
        } catch (error) {
            res.status(500).json(fail(error.message, { output: (error.stdout || '') + (error.stderr || '') }));
        }
    }

    async getModels(req, res) {
        try {
            const { stdout, stderr } = await dashboardPayloadService.runOpenclawRead(['models', 'status']);
            res.json(ok({ output: (stdout || '') + (stderr || '') }));
        } catch (error) {
            res.status(500).json(fail(error.message, { output: (error.stdout || '') + (error.stderr || '') }));
        }
    }

    async getAgents(req, res) {
        try {
            const { stdout, stderr } = await dashboardPayloadService.runOpenclawRead(['agents', 'list']);
            res.json(ok({ output: (stdout || '') + (stderr || '') }));
        } catch (error) {
            res.status(500).json(fail(error.message, { output: (error.stdout || '') + (error.stderr || '') }));
        }
    }

    async getSessionContent(req, res) {
        try {
            const result = sessionReadService.readSessionContent(req.params.agentId, req.params.sessionId);
            res.status(result.statusCode).json(result.body);
        } catch (error) {
            res.status(500).json(fail(error.message));
        }
    }

    async getSessions(req, res) {
        try {
            const result = sessionReadService.readSessions(req.params.agentId);
            res.status(result.statusCode).json(result.body);
        } catch (error) {
            res.status(500).json(fail(error.message));
        }
    }
}

module.exports = new DashboardReadController();
