// src/backend/middlewares/securityHeaders.js
'use strict';
const helmet = require('helmet');

/**
 * Security headers middleware using helmet
 * Provides comprehensive protection against common web vulnerabilities
 */
const cspDirectives = {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'"], // unsafe-inline needed for dynamic CSS
    imgSrc: ["'self'", 'data:', 'https:'],
    fontSrc: ["'self'"],
    objectSrc: ["'none'"],
    upgradeInsecureRequests: [],
};

function securityHeaders(req, res, next) {
    // Use helmet with custom configuration
    helmet({
        contentSecurityPolicy: {
            directives: cspDirectives,
        },
        crossOriginEmbedderPolicy: false, // Disabled for SSE compatibility
        crossOriginResourcePolicy: { policy: 'same-origin' },
    })(req, res, next);
}

/**
 * Request body size limit to prevent DoS
 */
const bodyParserOptions = {
    limit: '1mb', // Limit request body to 1MB
    type: 'application/json',
};

module.exports = {
    securityHeaders,
    bodyParserOptions,
};
