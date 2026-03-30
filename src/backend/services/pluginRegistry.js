// src/backend/services/pluginRegistry.js
'use strict';

/**
 * Plugin Registry - Simple plugin system for extensibility
 *
 * Plugins are objects with the following interface:
 * {
 *   name: string,           // Unique plugin identifier
 *   version: string,        // Plugin version
 *   enabled: boolean,       // Whether plugin is active
 *   priority: number,       // Lower = runs first (default 100)
 *   onRegister?: Function,   // Called when plugin is registered
 *   onUnregister?: Function, // Called when plugin is unregistered
 *   middleware?: Function[],  // Express middleware functions
 *   routes?: Function[],     // Function(route) that adds routes to router
 * }
 */

const logger = require('../utils/logger');

const plugins = new Map();
const pluginEvents = {
    beforeRegister: [],
    afterRegister: [],
    beforeUnregister: [],
    afterUnregister: [],
};

/**
 * Register a plugin
 * @param {Object} plugin - Plugin object
 * @returns {boolean} - Whether registration succeeded
 */
function registerPlugin(plugin) {
    if (!plugin || !plugin.name) {
        logger.warn('plugin_register_invalid', { error: 'Plugin must have a name' });
        return false;
    }

    if (plugins.has(plugin.name)) {
        logger.warn('plugin_already_registered', { name: plugin.name });
        return false;
    }

    // Validate plugin structure
    if (typeof plugin.name !== 'string' || plugin.name.length < 1 || plugin.name.length > 64) {
        logger.warn('plugin_invalid_name', { name: plugin.name });
        return false;
    }

    // Emit beforeRegister event
    for (const handler of pluginEvents.beforeRegister) {
        try {
            handler(plugin);
        } catch (err) {
            logger.error('plugin_before_register_error', { name: plugin.name, error: err.message });
        }
    }

    // Set defaults
    const normalizedPlugin = {
        name: plugin.name,
        version: plugin.version || '1.0.0',
        enabled: plugin.enabled !== false,
        priority: typeof plugin.priority === 'number' ? plugin.priority : 100,
        description: plugin.description || '',
        author: plugin.author || '',
        middleware: Array.isArray(plugin.middleware) ? plugin.middleware : [],
        routes: typeof plugin.routes === 'function' ? [plugin.routes] : (Array.isArray(plugin.routes) ? plugin.routes : []),
        _registeredAt: Date.now(),
        _internal: plugin._internal || false,
    };

    plugins.set(plugin.name, normalizedPlugin);

    // Call plugin's onRegister if provided
    if (typeof plugin.onRegister === 'function') {
        try {
            plugin.onRegister(normalizedPlugin);
        } catch (err) {
            logger.error('plugin_on_register_error', { name: plugin.name, error: err.message });
        }
    }

    // Emit afterRegister event
    for (const handler of pluginEvents.afterRegister) {
        try {
            handler(normalizedPlugin);
        } catch (err) {
            logger.error('plugin_after_register_error', { name: plugin.name, error: err.message });
        }
    }

    logger.info('plugin_registered', {
        name: plugin.name,
        version: normalizedPlugin.version,
        priority: normalizedPlugin.priority,
        middlewareCount: normalizedPlugin.middleware.length,
    });

    return true;
}

/**
 * Unregister a plugin
 * @param {string} name - Plugin name
 * @returns {boolean} - Whether unregistration succeeded
 */
function unregisterPlugin(name) {
    const plugin = plugins.get(name);
    if (!plugin) {
        logger.warn('plugin_not_found', { name });
        return false;
    }

    if (plugin._internal) {
        logger.warn('plugin_cannot_unregister_internal', { name });
        return false;
    }

    // Emit beforeUnregister event
    for (const handler of pluginEvents.beforeUnregister) {
        try {
            handler(plugin);
        } catch (err) {
            logger.error('plugin_before_unregister_error', { name, error: err.message });
        }
    }

    // Call plugin's onUnregister if provided
    if (typeof plugin.onUnregister === 'function') {
        try {
            plugin.onUnregister(plugin);
        } catch (err) {
            logger.error('plugin_on_unregister_error', { name, error: err.message });
        }
    }

    plugins.delete(name);

    // Emit afterUnregister event
    for (const handler of pluginEvents.afterUnregister) {
        try {
            handler(name);
        } catch (err) {
            logger.error('plugin_after_unregister_error', { name, error: err.message });
        }
    }

    logger.info('plugin_unregistered', { name });
    return true;
}

/**
 * Get a plugin by name
 * @param {string} name - Plugin name
 * @returns {Object|undefined}
 */
function getPlugin(name) {
    return plugins.get(name);
}

/**
 * Get all registered plugins
 * @returns {Object[]} Array of plugins
 */
function getAllPlugins() {
    return Array.from(plugins.values()).sort((a, b) => a.priority - b.priority);
}

/**
 * Get only enabled plugins
 * @returns {Object[]} Array of enabled plugins
 */
function getEnabledPlugins() {
    return getAllPlugins().filter(p => p.enabled);
}

/**
 * Enable a plugin
 * @param {string} name - Plugin name
 * @returns {boolean}
 */
function enablePlugin(name) {
    const plugin = plugins.get(name);
    if (!plugin) return false;
    plugin.enabled = true;
    logger.info('plugin_enabled', { name });
    return true;
}

/**
 * Disable a plugin
 * @param {string} name - Plugin name
 * @returns {boolean}
 */
function disablePlugin(name) {
    const plugin = plugins.get(name);
    if (!plugin) return false;
    if (plugin._internal) return false;
    plugin.enabled = false;
    logger.info('plugin_disabled', { name });
    return true;
}

/**
 * Get middleware from all enabled plugins
 * @returns {Function[]} Array of middleware functions
 */
function getPluginMiddleware() {
    return getEnabledPlugins()
        .flatMap(p => p.middleware)
        .filter(m => typeof m === 'function');
}

/**
 * Get routes from all enabled plugins
 * @param {Express.Router} router - Express router
 */
function applyPluginRoutes(router) {
    for (const plugin of getEnabledPlugins()) {
        for (const routeFn of plugin.routes) {
            try {
                if (typeof routeFn === 'function') {
                    routeFn(router, plugin);
                }
            } catch (err) {
                logger.error('plugin_route_error', { name: plugin.name, error: err.message });
            }
        }
    }
}

/**
 * Register an event handler
 * @param {string} event - Event name
 * @param {Function} handler - Event handler
 */
function on(event, handler) {
    if (pluginEvents[event]) {
        pluginEvents[event].push(handler);
    }
}

/**
 * Get registry statistics
 * @returns {Object}
 */
function getStats() {
    const all = getAllPlugins();
    return {
        total: all.length,
        enabled: all.filter(p => p.enabled).length,
        disabled: all.filter(p => !p.enabled).length,
        plugins: all.map(p => ({
            name: p.name,
            version: p.version,
            enabled: p.enabled,
            priority: p.priority,
        })),
    };
}

module.exports = {
    registerPlugin,
    unregisterPlugin,
    getPlugin,
    getAllPlugins,
    getEnabledPlugins,
    enablePlugin,
    disablePlugin,
    getPluginMiddleware,
    applyPluginRoutes,
    on,
    getStats,
};
