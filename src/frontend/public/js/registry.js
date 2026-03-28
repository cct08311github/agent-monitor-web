/**
 * Module Registry — single namespace for cross-module communication.
 * Replaces scattered window.* exports with App.register / App.get pattern.
 * HTML onclick handlers use App.bindHandlers() as the only window bridge.
 */
(function () {
    'use strict';
    const registry = Object.create(null);

    window.App = {
        register(namespace, api) {
            if (registry[namespace]) {
                console.warn('[App] namespace "' + namespace + '" already registered');
            }
            registry[namespace] = api;
        },

        get(namespace) {
            if (!registry[namespace]) {
                throw new Error('[App] module "' + namespace + '" not found');
            }
            return registry[namespace];
        },

        has(namespace) {
            return namespace in registry;
        },

        bindHandlers(handlers) {
            Object.assign(window, handlers);
        }
    };
})();
