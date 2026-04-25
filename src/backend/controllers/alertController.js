const alertEngine = require('../services/alertEngine');
const tsdbService = require('../services/tsdbService');
const { sendOk, sendFail } = require('../utils/apiResponse');
const logger = require('../utils/logger');

function getConfig(req, res) {
    return sendOk(res, { config: alertEngine.getConfig() });
}

function updateConfig(req, res) {
    try {
        const updated = alertEngine.updateConfig(/* istanbul ignore next */ req.body || {});
        return sendOk(res, { config: updated });
    } catch (e) {
        logger.warn('alert_config_update_invalid', { requestId: req.requestId, msg: e.message });
        return sendFail(res, 400, 'invalid_config');
    }
}

function getRecent(req, res) {
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    return sendOk(res, { alerts: alertEngine.getRecent(limit) });
}

function getHistory(req, res) {
    const rawFrom = parseInt(req.query.from, 10);
    const rawTo = parseInt(req.query.to, 10);
    const rawLimit = parseInt(req.query.limit, 10);

    const from = !isNaN(rawFrom) && rawFrom >= 0 ? rawFrom : undefined;
    const to = !isNaN(rawTo) && rawTo >= 0 ? rawTo : undefined;
    const limit = !isNaN(rawLimit) ? Math.min(Math.max(rawLimit, 1), 500) : 100;

    try {
        const alerts = tsdbService.getAlertHistory({ from, to, limit });
        return sendOk(res, { alerts, total: alerts.length });
    } catch (e) {
        logger.error('alert_history_error', { requestId: req.requestId, msg: e.message });
        return sendFail(res, 500, 'internal_error');
    }
}

module.exports = { getConfig, updateConfig, getRecent, getHistory };
