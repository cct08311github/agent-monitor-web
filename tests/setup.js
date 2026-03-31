// Global test setup: disable auth middleware so API tests don't need session cookies.
// Auth-specific tests (auth.test.js, sessionService.test.js) override this per describe block.
process.env.AUTH_DISABLED = 'true';
// Required for config validation - test secret (not used when AUTH_DISABLED=true)
process.env.AUTH_SESSION_SECRET = 'test-session-secret-for-unit-tests-only';
