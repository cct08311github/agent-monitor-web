const ALLOWED_HOST_PREFIXES = [
    'localhost', '127.0.0.1', '[::1]', '::1', '192.168.0.198',
    'shenghuoguanjiademac-mini.local', 'qiujuntingdeimac.local',
];

function getClientIp(req) {
    return (req.ip || req.connection?.remoteAddress || '').toString();
}

function isAllowedHost(value) {
    if (!value) return false;
    const hostOnly = value.replace(/:\d+$/, '');
    if (ALLOWED_HOST_PREFIXES.some((prefix) => hostOnly.startsWith(prefix))) return true;
    if (hostOnly.endsWith('.ts.net')) return true;
    if (hostOnly.startsWith('100.')) return true;
    if (hostOnly.startsWith('192.168.') || hostOnly.startsWith('10.')) return true;
    if (hostOnly.endsWith('.local')) return true;
    return false;
}

function localhostOnlyControl(req, res, next) {
    const hostHeader = (req.headers.host || '').toString().toLowerCase();
    const origin = (req.headers.origin || '').toString().toLowerCase();

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

module.exports = {
    getClientIp,
    isAllowedHost,
    localhostOnlyControl,
};
