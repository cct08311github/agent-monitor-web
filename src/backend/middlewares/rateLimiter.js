// src/backend/middlewares/rateLimiter.js
'use strict';
const rateLimit = require('express-rate-limit');

/**
 * Unified rate limiting middleware using express-rate-limit
 * Replaces scattered in-memory rate limiting with a more robust solution
 */

/**
 * General API rate limit - 100 requests per minute per IP
 */
const apiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100,
    standardHeaders: true, // Return rate limit info in headers
    legacyHeaders: false,
    message: { success: false, error: 'rate_limited', message: 'Too many requests' },
    // Use default keyGenerator (req.ip) - express-rate-limit handles IPv6 properly
    validate: { ipKeyGenerator: false },
});

/**
 * Strict rate limit for auth endpoints - 20 requests per minute per IP
 * Protects against brute force attacks
 */
const authLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'rate_limited', message: 'Too many authentication attempts' },
    validate: { ipKeyGenerator: false },
});

/**
 * Control endpoint rate limit - 30 requests per minute per IP
 * For command execution and control operations
 */
const controlLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'rate_limited', message: 'Too many control requests' },
    validate: { ipKeyGenerator: false },
});

module.exports = {
    apiLimiter,
    authLimiter,
    controlLimiter,
};
