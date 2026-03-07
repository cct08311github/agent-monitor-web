'use strict';

const logger = require('../utils/logger');

function requestLogger(req, res, next) {
    if (!req.originalUrl.startsWith('/api/')) {
        return next();
    }

    const start = Date.now();

    res.on('finish', () => {
        logger.info('api_request', {
            requestId: req.requestId,
            method: req.method,
            path: req.originalUrl,
            statusCode: res.statusCode,
            durationMs: Date.now() - start,
            ip: req.ip,
            userAgent: req.get('user-agent') || '',
        });
    });

    next();
}

module.exports = requestLogger;
