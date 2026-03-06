'use strict';

const { sendFail } = require('../utils/apiResponse');

function errorHandler(err, req, res, next) {
    if (res.headersSent) return next(err);

    const statusCode = Number(err && err.statusCode) || 500;
    const error = err && err.error ? err.error : (statusCode >= 500 ? 'internal_error' : 'request_failed');
    const extras = err && err.extras && typeof err.extras === 'object' ? err.extras : {};

    if (statusCode >= 500) {
        console.error('[API] Unhandled error:', err);
    }

    return sendFail(res, statusCode, error, extras);
}

module.exports = errorHandler;
