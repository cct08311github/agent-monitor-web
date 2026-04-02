const crypto = require('crypto');
const { getAuthConfig } = require('../config');

function requireBearerToken(req, res, next) {
    const { controlToken } = getAuthConfig();
    if (!controlToken) {
        return res.status(503).json({ success: false, error: 'control_not_configured' });
    }

    const auth = (req.headers.authorization || '').toString();
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (!m) {
        return res.status(401).json({ success: false, error: 'unauthorized' });
    }

    const token = m[1].trim();
    if (!token) return res.status(401).json({ success: false, error: 'unauthorized' });
    const tokenBuf = Buffer.from(token, 'utf8');
    const expectedBuf = Buffer.from(controlToken, 'utf8');
    if (tokenBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(tokenBuf, expectedBuf)) {
        return res.status(401).json({ success: false, error: 'unauthorized' });
    }

    req._actorToken = token;
    return next();
}

module.exports = {
    requireBearerToken,
};
