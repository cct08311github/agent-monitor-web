'use strict';

/**
 * CSRF Protection Middleware using Double-Submit Cookie Pattern
 *
 * Strategy: Generate a random CSRF token, store in HttpOnly cookie (set by server),
 * and require the client to send it via X-CSRF-Token header for state-changing requests.
 * The cookie is HttpOnly so JavaScript cannot read it (prevents XSS stealing tokens).
 *
 * Note: With SameSite=Strict cookies, CSRF is already heavily mitigated.
 * This provides defense-in-depth for cases where SameSite might be downgraded.
 */

const CSRF_SECRET_COOKIE = '_csrfSecret';
const CSRF_HEADER = 'x-csrf-token';

/**
 * Generate a cryptographically random CSRF token
 */
function generateCsrfToken() {
    const bytes = require('crypto').randomBytes(32);
    return bytes.toString('hex');
}

/**
 * Middleware that generates and sets CSRF token cookie
 * Should be applied after session/auth middleware
 */
function csrfTokenGenerator(req, res, next) {
    // Check if cookie already exists (session persistence)
    const existingToken = req.cookies?.[CSRF_SECRET_COOKIE];
    const token = existingToken || generateCsrfToken();

    // Set as HttpOnly cookie - JavaScript cannot read this
    res.cookie(CSRF_SECRET_COOKIE, token, {
        httpOnly: true,
        secure: true,           // HTTPS only
        sameSite: 'strict',    // Cannot be sent cross-site
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        path: '/',
    });

    // Store in request for reference
    req.csrfToken = token;
    req.csrfTokenHeader = CSRF_HEADER;

    next();
}

/**
 * Verify CSRF token on state-changing operations (POST, PUT, PATCH, DELETE)
 * Requires X-CSRF-Token header matching the cookie value
 *
 * Note: Skips verification when AUTH_DISABLED=true (testing mode)
 */
function csrfVerifier(req, res, next) {
    // Skip safe methods
    const method = req.method.toUpperCase();
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
        return next();
    }

    // Skip CSRF when auth is disabled (test mode)
    if (process.env.AUTH_DISABLED === 'true') {
        return next();
    }

    const cookieToken = req.cookies?.[CSRF_SECRET_COOKIE];
    const headerToken = req.headers[CSRF_HEADER];

    // If no cookie exists, this is likely a new session - reject
    if (!cookieToken) {
        return res.status(403).json({
            success: false,
            error: 'csrf_token_missing',
            message: 'CSRF token missing. Please refresh the page and try again.'
        });
    }

    // If no header token provided, reject
    if (!headerToken) {
        return res.status(403).json({
            success: false,
            error: 'csrf_token_missing',
            message: 'CSRF token header missing'
        });
    }

    // Use timing-safe comparison to prevent timing attacks
    try {
        if (!require('crypto').timingSafeEqual(
            Buffer.from(cookieToken, 'utf8'),
            Buffer.from(headerToken, 'utf8')
        )) {
            return res.status(403).json({
                success: false,
                error: 'csrf_token_invalid',
                message: 'Invalid CSRF token'
            });
        }
    } catch (e) {
        // Buffer lengths don't match - timingSafeEqual throws
        return res.status(403).json({
            success: false,
            error: 'csrf_token_invalid',
            message: 'Invalid CSRF token'
        });
    }

    next();
}

module.exports = {
    csrfTokenGenerator,
    csrfVerifier,
    CSRF_SECRET_COOKIE,
    CSRF_HEADER,
};
