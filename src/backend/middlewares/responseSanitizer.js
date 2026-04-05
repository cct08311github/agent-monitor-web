'use strict';

/**
 * responseSanitizer — defense-in-depth layer that strips Node.js Error
 * properties from any JSON response with success:false before it leaves
 * the process.
 *
 * Motivation: controllers that accidentally do `res.json({ ...err })` or
 * `{ error: err.message }` would leak internals. This middleware intercepts
 * res.json() and removes those fields, logging a warning so developers can
 * find and fix the root-call site.
 *
 * Safe-path: responses with success:true are passed through unchanged.
 */

const logger = require('../utils/logger');

// Fields that must never appear in error responses sent to clients.
// These are properties on Node.js Error objects or internal implementation details.
const BLOCKED_KEYS = new Set(['message', 'stack', 'errno', 'syscall', 'address', 'port', 'name', 'code']);

// Error code strings that are explicitly allowed (our own closed set).
// Any `code` value from a Node.js Error (e.g. 'ENOENT', 'ECONNREFUSED')
// is caught by BLOCKED_KEYS above, so these won't collide.
// This constant is here for documentation purposes only.
// const ALLOWED_CODES = new Set([...]);  // implicit — anything not in BLOCKED_KEYS

function scrubErrorBody(body, requestId) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return body;

    const scrubbed = {};
    const stripped = [];

    for (const [key, value] of Object.entries(body)) {
        if (BLOCKED_KEYS.has(key)) {
            stripped.push(key);
        } else {
            scrubbed[key] = value;
        }
    }

    if (stripped.length > 0) {
        logger.warn('response_sanitizer_stripped', {
            requestId,
            stripped,
            hint: 'Use sendFail(res, status, errorCode) instead of res.json() with raw Error fields',
        });
    }

    return scrubbed;
}

function responseSanitizer(req, res, next) {
    const originalJson = res.json.bind(res);

    res.json = function (body) {
        if (body && typeof body === 'object' && body.success === false) {
            body = scrubErrorBody(body, req.requestId);
        }
        return originalJson(body);
    };

    next();
}

module.exports = responseSanitizer;
