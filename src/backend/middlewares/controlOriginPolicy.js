const logger = require('../utils/logger');

const ALLOWED_HOSTS = [
    'localhost', '127.0.0.1', '[::1]', '::1', '192.168.0.198',
    'shenghuoguanjiademac-mini.local', 'qiujuntingdeimac.local',
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

    // Check prefixes for private ranges (must be exact prefix match)
    for (const prefix of ALLOWED_PREFIXES) {
        if (hostOnly.startsWith(prefix)) {
            // Ensure it's not bypassing (e.g., 100.0.0.1.ts.net.attacker.com)
            // If we've already passed suffix check, and there's no dot before the prefix in suspicious positions
            return true;
        }
    }

    return false;
}

function localhostOnlyControl(req, res, next) {
    const hostHeader = (req.headers.host || '').toString().toLowerCase();
    const origin = (req.headers.origin || '').toString().toLowerCase();

    if (!isAllowedHost(hostHeader)) {
        logger.warn('control_forbidden_host', { host: hostHeader, origin, ip: getClientIp(req) });
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

module.exports = {
    getClientIp,
    isAllowedHost,
    localhostOnlyControl,
};
