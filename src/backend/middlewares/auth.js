module.exports = {
    ...require('./controlOriginPolicy'),
    ...require('./controlAuth'),
    ...require('./controlRateLimit'),
    ...require('./controlAudit'),
    ...require('./loginRateLimit'),
    ...require('./sessionAuth'),
    ...require('./rateLimiter'),
};
