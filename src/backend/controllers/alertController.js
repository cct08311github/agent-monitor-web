const alertEngine = require('../services/alertEngine');

function getConfig(req, res) {
    res.json({ success: true, config: alertEngine.getConfig() });
}

function updateConfig(req, res) {
    try {
        const updated = alertEngine.updateConfig(req.body || {});
        res.json({ success: true, config: updated });
    } catch (e) {
        res.status(400).json({ success: false, error: e.message });
    }
}

function getRecent(req, res) {
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    res.json({ success: true, alerts: alertEngine.getRecent(limit) });
}

module.exports = { getConfig, updateConfig, getRecent };
