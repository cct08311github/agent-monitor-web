const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function getClientIp(req) {
    return (req.ip || req.connection?.remoteAddress || '').toString();
}

function tokenHashPrefix(token) {
    try {
        const h = crypto.createHash('sha256').update(String(token), 'utf8').digest('hex');
        return h.slice(0, 10);
    } catch (e) {
        return 'unknown';
    }
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
            const statusCode = res.statusCode || 200;

            appendAuditLog({
                ts: new Date().toISOString(),
                actor,
                ip,
                endpoint: req.originalUrl || req.url,
                command,
                statusCode,
                latencyMs: Math.round(latencyMs),
                success: statusCode >= 200 && statusCode < 300,
            });
        } catch (e) {}
    });
    return next();
}

module.exports = {
    controlAuditMiddleware,
};
