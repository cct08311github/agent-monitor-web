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
        const key = `${req.method} ${req.route?.path ?? req.originalUrl}`;
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
