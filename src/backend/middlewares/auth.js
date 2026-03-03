const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const CONTROL_RATE_LIMIT_PER_MINUTE = 30;
const CONTROL_TOKEN_ENV = process.env.HUD_CONTROL_TOKEN || process.env.OPENCLAW_HUD_CONTROL_TOKEN || '';
const CONTROL_TOKEN = String(CONTROL_TOKEN_ENV || '').trim();
const CONTROL_PASSWORD_HASH = '6b277d013fa68756e3c4cd0fe34f13c8deee437e939487e5c1f5ac5774db91b8'; // sha256('810778')

function tokenHashPrefix(token) {
    try {
        const h = crypto.createHash('sha256').update(String(token), 'utf8').digest('hex');
        return h.slice(0, 10);
    } catch (e) { /* istanbul ignore next */
        return 'unknown';
    }
}

function getClientIp(req) {
    return (req.ip || req.connection?.remoteAddress || '').toString();
}

function localhostOnlyControl(req, res, next) {
    const hostHeader = (req.headers.host || '').toString().toLowerCase();
    const origin = (req.headers.origin || '').toString().toLowerCase();

    const ALLOWED_HOST_PREFIXES = [
        'localhost', '127.0.0.1', '[::1]', '::1', '192.168.0.198',
        'shenghuoguanjiademac-mini.local', 'qiujuntingdeimac.local',
    ];

    const isAllowedHost = (value) => {
        if (!value) return false;
        // Strip port number for matching
        const hostOnly = value.replace(/:\d+$/, '');
        // Check static prefixes
        if (ALLOWED_HOST_PREFIXES.some((prefix) => hostOnly.startsWith(prefix))) return true;
        // Allow Tailscale domains (*.ts.net)
        if (hostOnly.endsWith('.ts.net')) return true;
        // Allow Tailscale CGNAT IP range (100.x.x.x)
        if (hostOnly.startsWith('100.')) return true;
        // Allow local network IPs (192.168.x.x, 10.x.x.x)
        if (hostOnly.startsWith('192.168.') || hostOnly.startsWith('10.')) return true;
        // Allow .local mDNS hostnames
        if (hostOnly.endsWith('.local')) return true;
        return false;
    };

    if (!isAllowedHost(hostHeader)) {
        console.warn(`[auth] forbidden_host: host="${hostHeader}", origin="${origin}", ip="${getClientIp(req)}"`);
        return res.status(403).json({ success: false, error: 'forbidden_host', message: 'Restricted', _debug_host: hostHeader, _debug_origin: origin });
    }

    if (origin) {
        const originHost = origin.replace(/^https?:\/\//, '').replace(/:\d+$/, '');
        if (!isAllowedHost(originHost)) {
            return res.status(403).json({ success: false, error: 'forbidden_origin', message: 'Restricted' });
        }
    }

    return next();
}

function requireBearerToken(req, res, next) {
    const auth = (req.headers.authorization || '').toString();
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (!m) {
        return res.status(401).json({ success: false, error: 'unauthorized' });
    }
    const token = m[1].trim();
    /* istanbul ignore next */
    if (!token) return res.status(401).json({ success: false, error: 'unauthorized' });

    let ok = false;
    if (CONTROL_TOKEN) {
        ok = (token === CONTROL_TOKEN);
    } else {
        const tokenHash = crypto.createHash('sha256').update(token, 'utf8').digest('hex');
        ok = (tokenHash === CONTROL_PASSWORD_HASH);
    }

    if (!ok) return res.status(401).json({ success: false, error: 'unauthorized' });
    req._actorToken = token;
    return next();
}

const buckets = new Map();
function rateLimit(req, res, next) {
    const ip = getClientIp(req) || 'unknown';
    const now = Date.now();
    const windowMs = 60000;

    const entry = buckets.get(ip) || { ts: [], lastGc: now };
    entry.ts = entry.ts.filter((t) => now - t < windowMs);
    entry.ts.push(now);

    /* istanbul ignore next */
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

function appendAuditLog(record) {
    try {
        const logsDir = path.join(__dirname, '../../../../logs');
        if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

        const date = new Date();
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        const filePath = path.join(logsDir, `audit-${y}-${m}-${d}.jsonl`);

        fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`, 'utf8');
    } catch (e) {
        console.error('[hud] Failed to write audit log:', e);
    }
}

function controlAuditMiddleware(req, res, next) {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
        try {
            const end = process.hrtime.bigint();
            const latencyMs = Number(end - start) / 1e6;
            const ip = getClientIp(req);
            const auth = (req.headers.authorization || '').toString();
            const m = auth.match(/^Bearer\s+(.+)$/i);
            const token = m ? m[1].trim() : '';
            const actor = token ? tokenHashPrefix(token) : 'missing';
            const command = req.body?.command;
            /* istanbul ignore next */
            const statusCode = res.statusCode || 200;

            appendAuditLog({
                ts: new Date().toISOString(), actor, ip, endpoint: req.originalUrl || req.url,
                command, statusCode, latencyMs: Math.round(latencyMs), success: statusCode >= 200 && statusCode < 300
            });
        } catch (e) { }
    });
    return next();
}

module.exports = {
    localhostOnlyControl,
    requireBearerToken,
    rateLimit,
    controlAuditMiddleware
};
