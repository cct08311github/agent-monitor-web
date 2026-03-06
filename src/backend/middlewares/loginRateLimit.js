const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const loginFailures = new Map();

function getClientIp(req) {
    return (req.ip || req.connection?.remoteAddress || '').toString();
}

function loginRateLimit(req, res, next) {
    const ip = getClientIp(req);
    const now = Date.now();
    const record = loginFailures.get(ip);

    if (record && now < record.resetAt && record.count >= LOGIN_MAX_ATTEMPTS) {
        return res.status(429).json({ success: false, error: 'too_many_attempts',
            retryAfter: Math.ceil((record.resetAt - now) / 1000) });
    }

    const origJson = res.json.bind(res);
    res.json = function (body) {
        if (res.statusCode === 401 || res.statusCode === 400) {
            const ts = Date.now();
            const rec = loginFailures.get(ip) || { count: 0, resetAt: ts + LOGIN_WINDOW_MS };
            if (ts >= rec.resetAt) { rec.count = 0; rec.resetAt = ts + LOGIN_WINDOW_MS; }
            rec.count += 1;
            loginFailures.set(ip, rec);
        } else if (res.statusCode < 400) {
            loginFailures.delete(ip);
        }
        return origJson(body);
    };

    return next();
}

module.exports = {
    loginRateLimit,
};
