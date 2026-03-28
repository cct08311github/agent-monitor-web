const { getAuthConfig } = require('../config');
const sessionService = require('../services/sessionService');

function extractToken(req) {
    // 1. Bearer token from Authorization header (iOS / API clients)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        return authHeader.slice(7);
    }
    // 2. Cookie-based session (web browser)
    return req.cookies?.sid || null;
}

function requireAuth(req, res, next) {
    const { authDisabled } = getAuthConfig();
    if (authDisabled) return next();

    const token = extractToken(req);
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
