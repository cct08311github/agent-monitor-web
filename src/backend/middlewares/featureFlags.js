// src/backend/middlewares/featureFlags.js
'use strict';

const logger = require('../utils/logger');

/**
 * Feature Flags - Feature toggle system
 *
 * Allows enabling/disabling features without code changes
 * Supports percentage rollouts and user-based targeting
 */

const DEFAULT_FLAGS = {
    // Core features (always on for now)
    dashboard: { enabled: true, description: 'Dashboard monitoring' },
    alerts: { enabled: true, description: 'Alert system' },
    taskhub: { enabled: true, description: 'Task management' },
    cron: { enabled: true, description: 'Cron job management' },
    optimize: { enabled: true, description: 'Auto-optimization' },
    watchdog: { enabled: true, description: 'Gateway watchdog' },

    // Beta/experimental features
    sseStream: { enabled: true, description: 'SSE real-time streaming' },
    charts: { enabled: true, description: 'System charts' },
    logsStream: { enabled: true, description: 'Live log streaming' },
};

// In-memory flags (could be persisted to config file)
let flags = { ...DEFAULT_FLAGS };

/**
 * Get all feature flags
 * @returns {Object}
 */
function getAllFlags() {
    return { ...flags };
}

/**
 * Get a specific flag
 * @param {string} name - Flag name
 * @returns {Object|undefined}
 */
function getFlag(name) {
    return flags[name];
}

/**
 * Check if a flag is enabled
 * @param {string} name - Flag name
 * @returns {boolean}
 */
function isEnabled(name) {
    const flag = flags[name];
    if (!flag) return false;
    return flag.enabled === true;
}

/**
 * Update a flag
 * @param {string} name - Flag name
 * @param {Object} updates - Updates to apply
 * @returns {boolean}
 */
function updateFlag(name, updates) {
    if (!flags[name]) {
        // Only allow creating new flags that start with "experimental_"
        if (!name.startsWith('experimental_')) {
            logger.warn('feature_flag_unknown', { name });
            return false;
        }
    }

    const { enabled, description } = updates;
    flags[name] = {
        ...flags[name],
        ...(typeof enabled === 'boolean' ? { enabled } : {}),
        ...(typeof description === 'string' ? { description } : {}),
        name,
    };

    logger.info('feature_flag_updated', { name, updates });
    return true;
}

/**
 * Reset all flags to defaults
 */
function resetFlags() {
    flags = { ...DEFAULT_FLAGS };
    logger.info('feature_flags_reset');
}

/**
 * Feature flag middleware
 * Checks if requested feature is enabled, returns 404 if not
 *
 * Usage:
 *   router.get('/api/feature', featureFlag('featureName'), handler);
 *
 * @param {string} featureName - Name of the feature flag
 * @returns {Function} Express middleware
 */
function featureFlag(featureName) {
    return (req, res, next) => {
        if (!isEnabled(featureName)) {
            logger.warn('feature_flag_disabled_access', {
                feature: featureName,
                path: req.path,
                ip: req.ip,
            });
            return res.status(404).json({
                success: false,
                error: 'feature_not_available',
                message: `Feature '${featureName}' is not currently enabled`,
            });
        }
        next();
    };
}

/**
 * Conditional middleware - applies middleware only if flag is enabled
 *
 * Usage:
 *   router.use(featureConditional('newFeature'), newFeatureMiddleware);
 *
 * @param {string} featureName - Name of the feature flag
 * @param {Function} middleware - Middleware to apply if enabled
 * @returns {Function} Express middleware
 */
function featureConditional(featureName, middleware) {
    return (req, res, next) => {
        if (isEnabled(featureName)) {
            return middleware(req, res, next);
        }
        next();
    };
}

/**
 * Get flags stats for admin endpoint
 * @returns {Object}
 */
function getStats() {
    const flagList = Object.entries(flags).map(([name, flag]) => ({
        name,
        enabled: flag.enabled,
        description: flag.description || '',
    }));

    return {
        total: flagList.length,
        enabled: flagList.filter(f => f.enabled).length,
        disabled: flagList.filter(f => !f.enabled).length,
        flags: flagList,
    };
}

module.exports = {
    getAllFlags,
    getFlag,
    isEnabled,
    updateFlag,
    resetFlags,
    featureFlag,
    featureConditional,
    getStats,
    DEFAULT_FLAGS,
};
