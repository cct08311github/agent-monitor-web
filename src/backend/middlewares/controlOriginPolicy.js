const logger = require('../utils/logger');

const ALLOWED_HOSTS = [
    'localhost', '127.0.0.1', '[::1]', '::1',
    // Additional hosts from env (comma-separated)
    ...(process.env.CONTROL_ALLOWED_HOSTS || '').split(',').map(h => h.trim().toLowerCase()).filter(Boolean),
];

const ALLOWED_SUFFIXES = [
    '.ts.net',      // Tailscale
    '.local',        // mDNS/Bonjour
];

const ALLOWED_PREFIXES = [
    '100.',         // Tailscale 100.x.x.x
    '192.168.',     // Private network
    '10.',          // Private network
];

function getClientIp(req) {
    return (req.ip || req.connection?.remoteAddress || '').toString();
}

function isAllowedHost(value) {
    if (!value) return false;
    const hostOnly = value.replace(/:\d+$/, '').toLowerCase();

    // Exact match (most secure)
    if (ALLOWED_HOSTS.includes(hostOnly)) return true;

    // Check suffixes - Tailscale domains end with .ts.net
    // e.g., "my-machine.ts.net" should be allowed
    // "evil.ts.net.attacker.com" would have suffix "ts.net.attacker.com" which doesn't match
    for (const suffix of ALLOWED_SUFFIXES) {
        if (hostOnly === suffix || hostOnly.endsWith(suffix)) {
            return true;
        }
    }

    // Check prefixes for private IP ranges — reject hostnames like 10.attacker.com
    for (const prefix of ALLOWED_PREFIXES) {
        if (hostOnly.startsWith(prefix)) {
            const remainder = hostOnly.slice(prefix.length);
            if (/^[\d.]+$/.test(remainder)) return true;
        }
    }

    return false;
}

function localhostOnlyControl(req, res, next) {
    const hostHeader = (req.headers.host || '').toString().toLowerCase();
    const origin = (req.headers.origin || '').toString().toLowerCase();

    if (!isAllowedHost(hostHeader)) {
        logger.warn('control_forbidden_host', { host: hostHeader, origin, ip: getClientIp(req) });
        return res.status(403).json({ success: false, error: 'forbidden_host', message: 'Restricted' });
    }

    if (origin) {
        const originHost = origin.replace(/^https?:\/\//, '').replace(/:\d+$/, '');
        if (!isAllowedHost(originHost)) {
            return res.status(403).json({ success: false, error: 'forbidden_origin', message: 'Restricted' });
        }
    }

    return next();
}

module.exports = {
    getClientIp,
    isAllowedHost,
    localhostOnlyControl,
};
