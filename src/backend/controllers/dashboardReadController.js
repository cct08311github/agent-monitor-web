const { ok, fail, sendOk, sendFail } = require('../utils/apiResponse');
const { getHistoryPayload } = require('../services/historyService');
const sessionReadService = require('../services/sessionReadService');
const dashboardPayloadService = require('../services/dashboardPayloadService');
const apiMetrics = require('../services/apiMetrics');
const logger = require('../utils/logger');

class DashboardReadController {
    async getDashboard(req, res) {
        try {
            if (req.query.force === '1') {
                dashboardPayloadService.invalidateSharedPayload();
            }
            if (dashboardPayloadService.shouldRefreshSharedPayload(5000)) {
                await dashboardPayloadService.updateSharedData();
            }
            return sendOk(res, dashboardPayloadService.getSharedPayload());
        } catch (error) { /* istanbul ignore next */
            logger.error('dashboard_read_error', { requestId: req.requestId, handler: 'getDashboard', msg: error.message });
            return sendFail(res, 500, 'internal_error');
        }
    }

    async getHistory(req, res) {
        try {
            return sendOk(res, getHistoryPayload());
        } catch (error) { /* istanbul ignore next */
            logger.error('dashboard_read_error', { requestId: req.requestId, handler: 'getHistory', msg: error.message });
            return sendFail(res, 500, 'internal_error');
        }
    }

    async streamDashboard(req, res) {
        const clientIp = req.ip;
        if (!dashboardPayloadService.addSseClient(res, clientIp)) {
            return sendFail(res, 503, 'sse_capacity_exceeded');
        }

        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        });
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
            return sendOk(res, { output: (stdout || '') + (stderr || '') });
        } catch (error) {
            logger.error('dashboard_read_error', { requestId: req.requestId, handler: 'getStatus', msg: error.message });
            return sendFail(res, 500, 'internal_error');
        }
    }

    async getModels(req, res) {
        try {
            const { stdout, stderr } = await dashboardPayloadService.runOpenclawRead(['models', 'status']);
            return sendOk(res, { output: (stdout || '') + (stderr || '') });
        } catch (error) {
            logger.error('dashboard_read_error', { requestId: req.requestId, handler: 'getModels', msg: error.message });
            return sendFail(res, 500, 'internal_error');
        }
    }

    async getAgents(req, res) {
        try {
            const { stdout, stderr } = await dashboardPayloadService.runOpenclawRead(['agents', 'list']);
            return sendOk(res, { output: (stdout || '') + (stderr || '') });
        } catch (error) {
            logger.error('dashboard_read_error', { requestId: req.requestId, handler: 'getAgents', msg: error.message });
            return sendFail(res, 500, 'internal_error');
        }
    }

    async getSessionContent(req, res) {
        try {
            const result = sessionReadService.readSessionContent(req.params.agentId, req.params.sessionId);
            res.status(result.statusCode).json(result.body);
        } catch (error) {
            logger.error('dashboard_read_error', { requestId: req.requestId, handler: 'getSessionContent', msg: error.message });
            return sendFail(res, 500, 'internal_error');
        }
    }

    async getSessions(req, res) {
        try {
            const result = sessionReadService.readSessions(req.params.agentId);
            res.status(result.statusCode).json(result.body);
        } catch (error) {
            logger.error('dashboard_read_error', { requestId: req.requestId, handler: 'getSessions', msg: error.message });
            return sendFail(res, 500, 'internal_error');
        }
    }

    async getMetrics(req, res) {
        try {
            return sendOk(res, { metrics: apiMetrics.getStats() });
        } catch (error) { /* istanbul ignore next */
            logger.error('dashboard_read_error', { requestId: req.requestId, handler: 'getMetrics', msg: error.message });
            return sendFail(res, 500, 'internal_error');
        }
    }
}

module.exports = new DashboardReadController();
