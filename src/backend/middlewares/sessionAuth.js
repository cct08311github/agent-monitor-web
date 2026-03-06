const { getAuthConfig } = require('../config');
const sessionService = require('../services/sessionService');

function requireAuth(req, res, next) {
    const { authDisabled } = getAuthConfig();
    if (authDisabled) return next();

    const token = req.cookies?.sid;
    if (!token) return res.status(401).json({ success: false, error: 'unauthenticated' });

    const session = sessionService.validateSession(token);
    if (!session) return res.status(401).json({ success: false, error: 'unauthenticated' });

    sessionService.touchSession(token);
    req._authUser = session.username;
    return next();
}

module.exports = {
    requireAuth,
};
