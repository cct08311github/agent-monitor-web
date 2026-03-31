// src/backend/middlewares/securityHeaders.js
'use strict';
const helmet = require('helmet');

/**
 * Security headers middleware using helmet
 * Provides comprehensive protection against common web vulnerabilities
 *
 * CSP: Using hash-based inline style allowlist instead of unsafe-inline
 * Hash is computed for the actual inline styles used in the app
 */
const cspDirectives = {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    // Hash for: body{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:1rem}
    styleSrc: ["'self'", "'sha256-nK8z4X0b6xOIL+lxL4gU2kVJ8FZ9QXqUq9o+9gR1Zbk='"],
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
        // Additional security headers
        noSniff: true,                    // X-Content-Type-Options: nosniff
        frameguard: { action: 'deny' },   // X-Frame-Options: DENY
        xssFilter: true,                  // X-XSS-Protection (legacy but still useful)
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
