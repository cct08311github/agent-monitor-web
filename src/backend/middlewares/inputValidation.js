// src/backend/middlewares/inputValidation.js
'use strict';
const AppError = require('../utils/appError');

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
 * Validate and sanitize request body
 * @param {Object} schema - Object defining expected fields and their patterns
 */
function validateBody(schema) {
    return (req, res, next) => {
        const body = req.body || {};
        const errors = [];

        for (const [field, pattern] of Object.entries(schema)) {
            const value = body[field];
            if (value !== undefined && value !== null) {
                const stringValue = String(value);
                if (!pattern.test(stringValue)) {
                    errors.push(`Invalid ${field}`);
                } else {
                    req.body[field] = sanitizeString(stringValue);
                }
            }
        }

        if (errors.length > 0) {
            return res.status(400).json({
                success: false,
                error: 'validation_error',
                details: errors,
            });
        }

        next();
    };
}

/**
 * Middleware to validate agent ID parameter
 */
function validateAgentId(req, res, next) {
    const { agentId } = req.params;
    if (agentId && !PATTERNS.id.test(agentId)) {
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
    if (sessionId && !PATTERNS.id.test(sessionId)) {
        return res.status(400).json({
            success: false,
            error: 'validation_error',
            message: 'Invalid session ID format',
        });
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
    validateBody,
    validateAgentId,
    validateSessionId,
    validateDomain,
    sanitizeString,
    PATTERNS,
};
