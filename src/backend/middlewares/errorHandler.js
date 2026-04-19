'use strict';

const { sendFail } = require('../utils/apiResponse');
const logger = require('../utils/logger');

function errorHandler(err, req, res, next) {
    if (res.headersSent) return next(err);

    const statusCode = Number(err && err.statusCode) || 500;
    const error = err && err.error ? err.error : (statusCode >= 500 ? 'internal_error' : 'request_failed');
    const extras = err && err.extras && typeof err.extras === 'object' ? err.extras : {};

    logger.error('api_error', {
        requestId: req.requestId,
        method: req.method,
        path: req.originalUrl,
        statusCode,
        error,
        details: logger.toErrorFields(err),
    });

    // Make error code available to requestLogger via res.locals (for errorBuffer)
    res.locals.errorCode = error;

    return sendFail(res, statusCode, error, { requestId: req.requestId, ...extras });
}

module.exports = errorHandler;
