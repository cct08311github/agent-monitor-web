const alertEngine = require('../services/alertEngine');
const { sendOk, sendFail } = require('../utils/apiResponse');

function getConfig(req, res) {
    return sendOk(res, { config: alertEngine.getConfig() });
}

function updateConfig(req, res) {
    try {
        const updated = alertEngine.updateConfig(/* istanbul ignore next */ req.body || {});
        return sendOk(res, { config: updated });
    } catch (e) {
        return sendFail(res, 400, e.message);
    }
}

function getRecent(req, res) {
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    return sendOk(res, { alerts: alertEngine.getRecent(limit) });
}

module.exports = { getConfig, updateConfig, getRecent };
