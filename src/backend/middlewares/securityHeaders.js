// src/backend/middlewares/securityHeaders.js
'use strict';
const helmet = require('helmet');

/**
 * Security headers middleware using helmet
 * Provides comprehensive protection against common web vulnerabilities
 *
 * CSP notes:
 * - script-src: 'unsafe-inline' required because the frontend uses onclick= attributes
 *   extensively (60+ handlers). Mitigated by: internal tailnet-only access, HttpOnly cookies,
 *   strict input validation on all API endpoints.
 * - style-src: 'unsafe-inline' required because JS modules set element.style dynamically
 *   for show/hide, progress bars, charts, etc. Inline style XSS risk is minimal.
 */
const cspDirectives = {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "'unsafe-inline'"],
    scriptSrcAttr: ["'unsafe-inline'"],  // Required for onclick= handlers
    styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    imgSrc: ["'self'", 'data:', 'https:'],
    fontSrc: ["'self'", 'https://fonts.gstatic.com'],
    objectSrc: ["'none'"],
    frameAncestors: ["'none'"],
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
