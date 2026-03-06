const CONTROL_RATE_LIMIT_PER_MINUTE = 30;
const buckets = new Map();

function getClientIp(req) {
    return (req.ip || req.connection?.remoteAddress || '').toString();
}

function rateLimit(req, res, next) {
    const ip = getClientIp(req) || 'unknown';
    const now = Date.now();
    const windowMs = 60000;

    const entry = buckets.get(ip) || { ts: [], lastGc: now };
    entry.ts = entry.ts.filter((t) => now - t < windowMs);
    entry.ts.push(now);

    if (now - entry.lastGc > 10 * windowMs) {
        entry.lastGc = now;
        for (const [k, v] of buckets.entries()) {
            const newest = v.ts[v.ts.length - 1] || 0;
            if (now - newest > 30 * windowMs) buckets.delete(k);
        }
    }

    buckets.set(ip, entry);
    if (entry.ts.length > CONTROL_RATE_LIMIT_PER_MINUTE) {
        return res.status(429).json({ success: false, error: 'rate_limited', message: 'Too many requests' });
    }
    return next();
}

module.exports = {
    rateLimit,
};
