// src/backend/middlewares/inputValidation.js
'use strict';

/**
 * Input validation middleware
 * Sanitizes and validates user inputs to prevent injection attacks
 */

// Patterns for validation
const PATTERNS = {
    // Alphanumeric, dash, underscore, 1-64 chars
    id: /^[a-zA-Z0-9_-]{1,64}$/,
    // General text, max 256 chars
    text: /^.{1,256}$/,
    // JSON-safe object
    json: /^[{[].*[}\]]$/,
    // Domain name pattern
    domain: /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/,
};

/**
 * Sanitize a string by removing control characters
 * @param {string} input
 * @returns {string}
 */
function sanitizeString(input) {
    if (typeof input !== 'string') return input;
    // Remove null bytes and control characters except newline/tab
    return input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').slice(0, 10000);
}

/**
 * Middleware to validate agent ID parameter
 */
function validateAgentId(req, res, next) {
    const { agentId } = req.params;
    // M1: reject empty string (agentId !== undefined covers both present+empty and present+invalid)
    if (agentId !== undefined && !PATTERNS.id.test(agentId)) {
        return res.status(400).json({
            success: false,
            error: 'validation_error',
            message: 'Invalid agent ID format',
        });
    }
    next();
}

/**
 * Middleware to validate session ID parameter
 */
function validateSessionId(req, res, next) {
    const { sessionId } = req.params;
    // M1: reject empty string (sessionId !== undefined covers both present+empty and present+invalid)
    if (sessionId !== undefined && !PATTERNS.id.test(sessionId)) {
        return res.status(400).json({
            success: false,
            error: 'validation_error',
            message: 'Invalid session ID format',
        });
    }
    next();
}

/**
 * Middleware to validate task ID parameter
 */
function validateTaskId(req, res, next) {
    const id = req.params.id;
    if (!id || typeof id !== 'string' || id.length > 100 || !/^[A-Za-z0-9_-]+$/.test(id)) {
        return res.status(400).json({ success: false, error: 'invalid_task_id' });
    }
    next();
}

/**
 * Middleware to validate domain parameter
 */
function validateDomain(req, res, next) {
    const { domain } = req.params || req.body || {};
    if (domain && !PATTERNS.domain.test(domain)) {
        return res.status(400).json({
            success: false,
            error: 'validation_error',
            message: 'Invalid domain format',
        });
    }
    next();
}

module.exports = {
    validateAgentId,
    validateSessionId,
    validateDomain,
    validateTaskId,
    sanitizeString,
    PATTERNS,
};
