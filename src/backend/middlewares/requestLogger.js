'use strict';

const logger = require('../utils/logger');
const apiMetrics = require('../services/apiMetrics');

function requestLogger(req, res, next) {
    if (!req.originalUrl.startsWith('/api/')) {
        return next();
    }

    const start = Date.now();

    res.on('finish', () => {
        const duration = Date.now() - start;
        // Strip query string from fallback to prevent cardinality explosion
        // (req.route.path is undefined for 404 / unmatched routes — fallback
        // would otherwise include ?foo=1 variants as distinct keys).
        const pathKey = req.route?.path ?? req.originalUrl.split('?')[0];
        const key = `${req.method} ${pathKey}`;
        apiMetrics.record(key, duration);
        logger.info('api_request', {
            requestId: req.requestId,
            method: req.method,
            path: req.originalUrl,
            statusCode: res.statusCode,
            durationMs: duration,
            ip: req.ip,
            userAgent: req.get('user-agent') || '',
        });
    });

    next();
}

module.exports = requestLogger;
