// src/backend/middlewares/asyncHandler.js
'use strict';
const logger = require('../utils/logger');

/**
 * Async handler wrapper
 * Wraps async route handlers to ensure errors are caught and passed to error middleware
 * Eliminates need for try-catch in every controller method
 *
 * Usage:
 *   router.get('/path', asyncHandler(async (req, res, next) => {
 *       const data = await someAsyncOperation();
 *       return sendOk(res, { data });
 *   }));
 *
 * @param {Function} fn - Async route handler function
 * @returns {Function} - Wrapped handler
 */
function asyncHandler(fn) {
    return function(req, res, next) {
        Promise.resolve(fn(req, res, next)).catch((error) => {
            // Log the error with request context
            logger.error('async_handler_error', {
                requestId: req.requestId,
                path: req.path,
                method: req.method,
                error: error.message,
                stack: error.stack,
            });
            next(error);
        });
    };
}

/**
 * Safe JSON parse - returns fallback on error
 * @param {string} str - JSON string to parse
 * @param {*} fallback - Fallback value on parse error
 * @returns {*}
 */
function safeJsonParse(str, fallback = null) {
    if (!str) return fallback;
    try {
        return JSON.parse(str);
    } catch {
        return fallback;
    }
}

/**
 * Extract request ID from various sources
 * @param {object} req - Express request
 * @returns {string} - Request ID
 */
function getRequestId(req) {
    return req.requestId || req.headers['x-request-id'] || 'unknown';
}

module.exports = {
    asyncHandler,
    safeJsonParse,
    getRequestId,
};
