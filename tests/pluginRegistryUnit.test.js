'use strict';

// Unit tests for src/backend/services/pluginRegistry.js
// Uses jest.resetModules() per test to get a fresh module instance
// (the module has top-level Map + event arrays that persist across requires).

let registry;
let logger;

beforeEach(() => {
    jest.resetModules();
    jest.mock('../src/backend/utils/logger', () => ({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    }));
    registry = require('../src/backend/services/pluginRegistry');
    logger = require('../src/backend/utils/logger');
});

afterEach(() => {
    jest.clearAllMocks();
});

// ─── registerPlugin — validation ──────────────────────────────────────────────

describe('registerPlugin — validation', () => {
    it('returns true and logs info on successful registration', () => {
        const result = registry.registerPlugin({ name: 'my-plugin' });
        expect(result).toBe(true);
        expect(logger.info).toHaveBeenCalledWith('plugin_registered', expect.objectContaining({ name: 'my-plugin' }));
    });

    it('returns false and warns when plugin is null', () => {
        expect(registry.registerPlugin(null)).toBe(false);
        expect(logger.warn).toHaveBeenCalledWith('plugin_register_invalid', expect.any(Object));
    });

    it('returns false and warns when plugin is undefined', () => {
        expect(registry.registerPlugin(undefined)).toBe(false);
        expect(logger.warn).toHaveBeenCalledWith('plugin_register_invalid', expect.any(Object));
    });

    it('returns false and warns when plugin has no name property', () => {
        expect(registry.registerPlugin({ version: '1.0.0' })).toBe(false);
        expect(logger.warn).toHaveBeenCalledWith('plugin_register_invalid', expect.any(Object));
    });

    it('returns false and warns on duplicate registration', () => {
        registry.registerPlugin({ name: 'dup' });
        const result = registry.registerPlugin({ name: 'dup' });
        expect(result).toBe(false);
        expect(logger.warn).toHaveBeenCalledWith('plugin_already_registered', expect.objectContaining({ name: 'dup' }));
    });

    it('returns false and warns when name exceeds 64 characters', () => {
        const longName = 'a'.repeat(65);
        expect(registry.registerPlugin({ name: longName })).toBe(false);
        expect(logger.warn).toHaveBeenCalledWith('plugin_invalid_name', expect.any(Object));
    });

    it('accepts name of exactly 64 characters', () => {
        expect(registry.registerPlugin({ name: 'a'.repeat(64) })).toBe(true);
    });

    it('returns false when name is empty string (falsy, triggers register_invalid)', () => {
        // Empty string is falsy → caught by !plugin.name check
        expect(registry.registerPlugin({ name: '' })).toBe(false);
    });
});

// ─── registerPlugin — normalization ──────────────────────────────────────────

describe('registerPlugin — normalization', () => {
    it('defaults version to 1.0.0 when omitted', () => {
        registry.registerPlugin({ name: 'no-ver' });
        expect(registry.getPlugin('no-ver').version).toBe('1.0.0');
    });

    it('preserves provided version', () => {
        registry.registerPlugin({ name: 'ver', version: '2.3.4' });
        expect(registry.getPlugin('ver').version).toBe('2.3.4');
    });

    it('defaults enabled to true', () => {
        registry.registerPlugin({ name: 'e' });
        expect(registry.getPlugin('e').enabled).toBe(true);
    });

    it('stores enabled=false when explicitly passed', () => {
        registry.registerPlugin({ name: 'dis', enabled: false });
        expect(registry.getPlugin('dis').enabled).toBe(false);
    });

    it('defaults priority to 100', () => {
        registry.registerPlugin({ name: 'p' });
        expect(registry.getPlugin('p').priority).toBe(100);
    });

    it('preserves numeric priority', () => {
        registry.registerPlugin({ name: 'prio', priority: 42 });
        expect(registry.getPlugin('prio').priority).toBe(42);
    });

    it('ignores non-numeric priority and defaults to 100', () => {
        registry.registerPlugin({ name: 'bad-prio', priority: 'high' });
        expect(registry.getPlugin('bad-prio').priority).toBe(100);
    });

    it('normalizes non-array middleware to empty array', () => {
        registry.registerPlugin({ name: 'mw', middleware: 'bad' });
        expect(registry.getPlugin('mw').middleware).toEqual([]);
    });

    it('preserves array middleware', () => {
        const mw = [jest.fn()];
        registry.registerPlugin({ name: 'mw2', middleware: mw });
        expect(registry.getPlugin('mw2').middleware).toHaveLength(1);
    });

    it('wraps a single route function in an array', () => {
        const fn = jest.fn();
        registry.registerPlugin({ name: 'sr', routes: fn });
        expect(registry.getPlugin('sr').routes).toEqual([fn]);
    });

    it('preserves array routes', () => {
        const fns = [jest.fn(), jest.fn()];
        registry.registerPlugin({ name: 'ar', routes: fns });
        expect(registry.getPlugin('ar').routes).toHaveLength(2);
    });

    it('normalizes non-function/non-array routes to empty array', () => {
        registry.registerPlugin({ name: 'br', routes: 99 });
        expect(registry.getPlugin('br').routes).toEqual([]);
    });

    it('stores _internal flag', () => {
        registry.registerPlugin({ name: 'int', _internal: true });
        expect(registry.getPlugin('int')._internal).toBe(true);
    });

    it('sets _registeredAt to a recent timestamp', () => {
        const before = Date.now();
        registry.registerPlugin({ name: 'ts' });
        const after = Date.now();
        const ts = registry.getPlugin('ts')._registeredAt;
        expect(ts).toBeGreaterThanOrEqual(before);
        expect(ts).toBeLessThanOrEqual(after);
    });

    it('defaults description and author to empty string', () => {
        registry.registerPlugin({ name: 'da' });
        const p = registry.getPlugin('da');
        expect(p.description).toBe('');
        expect(p.author).toBe('');
    });

    it('stores provided description and author', () => {
        registry.registerPlugin({ name: 'da2', description: 'A plugin', author: 'Alice' });
        const p = registry.getPlugin('da2');
        expect(p.description).toBe('A plugin');
        expect(p.author).toBe('Alice');
    });
});

// ─── registerPlugin — onRegister callback ────────────────────────────────────

describe('registerPlugin — onRegister callback', () => {
    it('calls onRegister with the normalized plugin', () => {
        const onRegister = jest.fn();
        registry.registerPlugin({ name: 'cb', onRegister });
        expect(onRegister).toHaveBeenCalledWith(expect.objectContaining({ name: 'cb' }));
    });

    it('logs error and still returns true when onRegister throws', () => {
        const onRegister = jest.fn(() => { throw new Error('oops'); });
        expect(registry.registerPlugin({ name: 'cb-err', onRegister })).toBe(true);
        expect(logger.error).toHaveBeenCalledWith('plugin_on_register_error', expect.any(Object));
    });
});

// ─── registerPlugin — event lifecycle ────────────────────────────────────────

describe('registerPlugin — event lifecycle', () => {
    it('calls beforeRegister handlers before onRegister', () => {
        const order = [];
        registry.on('beforeRegister', () => order.push('before'));
        registry.registerPlugin({ name: 'ev1', onRegister: () => order.push('on') });
        expect(order).toEqual(['before', 'on']);
    });

    it('calls afterRegister handlers with normalized plugin', () => {
        const after = jest.fn();
        registry.on('afterRegister', after);
        registry.registerPlugin({ name: 'ev2' });
        expect(after).toHaveBeenCalledWith(expect.objectContaining({ name: 'ev2' }));
    });

    it('logs error and continues when beforeRegister throws', () => {
        registry.on('beforeRegister', () => { throw new Error('be'); });
        expect(registry.registerPlugin({ name: 'be-err' })).toBe(true);
        expect(logger.error).toHaveBeenCalledWith('plugin_before_register_error', expect.any(Object));
    });

    it('logs error and continues when afterRegister throws', () => {
        registry.on('afterRegister', () => { throw new Error('ae'); });
        expect(registry.registerPlugin({ name: 'ae-err' })).toBe(true);
        expect(logger.error).toHaveBeenCalledWith('plugin_after_register_error', expect.any(Object));
    });
});

// ─── unregisterPlugin ─────────────────────────────────────────────────────────

describe('unregisterPlugin', () => {
    it('returns true and removes the plugin', () => {
        registry.registerPlugin({ name: 'rm' });
        expect(registry.unregisterPlugin('rm')).toBe(true);
        expect(registry.getPlugin('rm')).toBeUndefined();
        expect(logger.info).toHaveBeenCalledWith('plugin_unregistered', { name: 'rm' });
    });

    it('returns false and warns when plugin not found', () => {
        expect(registry.unregisterPlugin('ghost')).toBe(false);
        expect(logger.warn).toHaveBeenCalledWith('plugin_not_found', { name: 'ghost' });
    });

    it('returns false and warns when plugin is internal', () => {
        registry.registerPlugin({ name: 'core', _internal: true });
        expect(registry.unregisterPlugin('core')).toBe(false);
        expect(logger.warn).toHaveBeenCalledWith('plugin_cannot_unregister_internal', { name: 'core' });
    });

    it('onUnregister on the input plugin is not preserved in the normalized object (dead code path)', () => {
        // The normalizedPlugin stored in the registry does not copy onUnregister from the
        // raw input, so plugin.onUnregister is always undefined after registration.
        // This test documents that the stored plugin has no onUnregister method.
        const onUnregister = jest.fn();
        registry.registerPlugin({ name: 'ou', onUnregister });
        expect(registry.getPlugin('ou').onUnregister).toBeUndefined();
        // Unregistering still succeeds
        expect(registry.unregisterPlugin('ou')).toBe(true);
        // onUnregister callback on the raw input is never invoked
        expect(onUnregister).not.toHaveBeenCalled();
    });

    it('calls beforeUnregister handlers', () => {
        const handler = jest.fn();
        registry.on('beforeUnregister', handler);
        registry.registerPlugin({ name: 'bu' });
        registry.unregisterPlugin('bu');
        expect(handler).toHaveBeenCalledWith(expect.objectContaining({ name: 'bu' }));
    });

    it('calls afterUnregister handlers with the plugin name string', () => {
        const handler = jest.fn();
        registry.on('afterUnregister', handler);
        registry.registerPlugin({ name: 'au' });
        registry.unregisterPlugin('au');
        expect(handler).toHaveBeenCalledWith('au');
    });

    it('logs error and continues when beforeUnregister throws', () => {
        registry.on('beforeUnregister', () => { throw new Error('bu-err'); });
        registry.registerPlugin({ name: 'bu-throw' });
        expect(registry.unregisterPlugin('bu-throw')).toBe(true);
        expect(logger.error).toHaveBeenCalledWith('plugin_before_unregister_error', expect.any(Object));
    });

    it('logs error and continues when afterUnregister throws', () => {
        registry.on('afterUnregister', () => { throw new Error('au-err'); });
        registry.registerPlugin({ name: 'au-throw' });
        expect(registry.unregisterPlugin('au-throw')).toBe(true);
        expect(logger.error).toHaveBeenCalledWith('plugin_after_unregister_error', expect.any(Object));
    });
});

// ─── getPlugin ────────────────────────────────────────────────────────────────

describe('getPlugin', () => {
    it('returns the stored plugin by name', () => {
        registry.registerPlugin({ name: 'find-me' });
        expect(registry.getPlugin('find-me')).toMatchObject({ name: 'find-me' });
    });

    it('returns undefined for unknown name', () => {
        expect(registry.getPlugin('nope')).toBeUndefined();
    });
});

// ─── getAllPlugins ─────────────────────────────────────────────────────────────

describe('getAllPlugins', () => {
    it('returns empty array when registry is empty', () => {
        expect(registry.getAllPlugins()).toEqual([]);
    });

    it('returns plugins sorted by priority ascending', () => {
        registry.registerPlugin({ name: 'low', priority: 200 });
        registry.registerPlugin({ name: 'high', priority: 10 });
        registry.registerPlugin({ name: 'mid', priority: 100 });
        expect(registry.getAllPlugins().map(p => p.name)).toEqual(['high', 'mid', 'low']);
    });

    it('includes both enabled and disabled plugins', () => {
        registry.registerPlugin({ name: 'on' });
        registry.registerPlugin({ name: 'off', enabled: false });
        expect(registry.getAllPlugins()).toHaveLength(2);
    });
});

// ─── getEnabledPlugins ────────────────────────────────────────────────────────

describe('getEnabledPlugins', () => {
    it('returns only enabled plugins', () => {
        registry.registerPlugin({ name: 'e1' });
        registry.registerPlugin({ name: 'd1', enabled: false });
        registry.registerPlugin({ name: 'e2' });
        const enabled = registry.getEnabledPlugins();
        expect(enabled).toHaveLength(2);
        expect(enabled.map(p => p.name)).not.toContain('d1');
    });

    it('returns empty array when all plugins are disabled', () => {
        registry.registerPlugin({ name: 'x', enabled: false });
        expect(registry.getEnabledPlugins()).toEqual([]);
    });

    it('returns empty array when no plugins exist', () => {
        expect(registry.getEnabledPlugins()).toEqual([]);
    });
});

// ─── enablePlugin ─────────────────────────────────────────────────────────────

describe('enablePlugin', () => {
    it('enables a disabled plugin and returns true', () => {
        registry.registerPlugin({ name: 'sleepy', enabled: false });
        expect(registry.enablePlugin('sleepy')).toBe(true);
        expect(registry.getPlugin('sleepy').enabled).toBe(true);
        expect(logger.info).toHaveBeenCalledWith('plugin_enabled', { name: 'sleepy' });
    });

    it('returns false for unknown plugin', () => {
        expect(registry.enablePlugin('ghost')).toBe(false);
    });

    it('returns true even if plugin was already enabled', () => {
        registry.registerPlugin({ name: 'already-on' });
        expect(registry.enablePlugin('already-on')).toBe(true);
    });
});

// ─── disablePlugin ────────────────────────────────────────────────────────────

describe('disablePlugin', () => {
    it('disables an enabled plugin and returns true', () => {
        registry.registerPlugin({ name: 'active' });
        expect(registry.disablePlugin('active')).toBe(true);
        expect(registry.getPlugin('active').enabled).toBe(false);
        expect(logger.info).toHaveBeenCalledWith('plugin_disabled', { name: 'active' });
    });

    it('returns false for unknown plugin', () => {
        expect(registry.disablePlugin('ghost')).toBe(false);
    });

    it('returns false and does not disable an internal plugin', () => {
        registry.registerPlugin({ name: 'core', _internal: true });
        expect(registry.disablePlugin('core')).toBe(false);
        expect(registry.getPlugin('core').enabled).toBe(true);
    });
});

// ─── getPluginMiddleware ──────────────────────────────────────────────────────

describe('getPluginMiddleware', () => {
    it('returns empty array when no plugins exist', () => {
        expect(registry.getPluginMiddleware()).toEqual([]);
    });

    it('collects function middleware from enabled plugins, sorted by priority', () => {
        const mw1 = jest.fn();
        const mw2 = jest.fn();
        registry.registerPlugin({ name: 'p1', priority: 50, middleware: [mw1] });
        registry.registerPlugin({ name: 'p2', priority: 10, middleware: [mw2] });
        expect(registry.getPluginMiddleware()).toEqual([mw2, mw1]);
    });

    it('excludes middleware from disabled plugins', () => {
        registry.registerPlugin({ name: 'off', enabled: false, middleware: [jest.fn()] });
        expect(registry.getPluginMiddleware()).toEqual([]);
    });

    it('filters non-function entries from middleware arrays', () => {
        const fn = jest.fn();
        registry.registerPlugin({ name: 'mixed', middleware: [fn, 'str', null, 42] });
        expect(registry.getPluginMiddleware()).toEqual([fn]);
    });

    it('concatenates middleware from multiple plugins', () => {
        registry.registerPlugin({ name: 'a', middleware: [jest.fn(), jest.fn()] });
        registry.registerPlugin({ name: 'b', middleware: [jest.fn()] });
        expect(registry.getPluginMiddleware()).toHaveLength(3);
    });
});

// ─── applyPluginRoutes ────────────────────────────────────────────────────────

describe('applyPluginRoutes', () => {
    it('calls each route function with (router, plugin)', () => {
        const fn = jest.fn();
        registry.registerPlugin({ name: 'rp', routes: [fn] });
        const mockRouter = {};
        registry.applyPluginRoutes(mockRouter);
        expect(fn).toHaveBeenCalledWith(mockRouter, expect.objectContaining({ name: 'rp' }));
    });

    it('skips routes from disabled plugins', () => {
        const fn = jest.fn();
        registry.registerPlugin({ name: 'off', enabled: false, routes: [fn] });
        registry.applyPluginRoutes({});
        expect(fn).not.toHaveBeenCalled();
    });

    it('applies routes in priority order', () => {
        const order = [];
        registry.registerPlugin({ name: 'slow', priority: 200, routes: [() => order.push('slow')] });
        registry.registerPlugin({ name: 'fast', priority: 10, routes: [() => order.push('fast')] });
        registry.applyPluginRoutes({});
        expect(order).toEqual(['fast', 'slow']);
    });

    it('logs error and continues when a route function throws', () => {
        const bad = jest.fn(() => { throw new Error('route-err'); });
        const good = jest.fn();
        registry.registerPlugin({ name: 'bad', priority: 10, routes: [bad] });
        registry.registerPlugin({ name: 'good', priority: 20, routes: [good] });
        expect(() => registry.applyPluginRoutes({})).not.toThrow();
        expect(logger.error).toHaveBeenCalledWith('plugin_route_error', expect.any(Object));
        expect(good).toHaveBeenCalled();
    });

    it('does nothing when registry is empty', () => {
        expect(() => registry.applyPluginRoutes({})).not.toThrow();
    });
});

// ─── on ───────────────────────────────────────────────────────────────────────

describe('on', () => {
    it('registers multiple handlers for the same event', () => {
        const h1 = jest.fn();
        const h2 = jest.fn();
        registry.on('afterRegister', h1);
        registry.on('afterRegister', h2);
        registry.registerPlugin({ name: 'multi' });
        expect(h1).toHaveBeenCalled();
        expect(h2).toHaveBeenCalled();
    });

    it('ignores unknown event names without throwing', () => {
        expect(() => registry.on('notAnEvent', jest.fn())).not.toThrow();
    });

    it('wires up all four event types', () => {
        const handlers = {
            beforeRegister: jest.fn(),
            afterRegister: jest.fn(),
            beforeUnregister: jest.fn(),
            afterUnregister: jest.fn(),
        };
        for (const [event, handler] of Object.entries(handlers)) {
            registry.on(event, handler);
        }
        registry.registerPlugin({ name: 'all-events' });
        registry.unregisterPlugin('all-events');
        expect(handlers.beforeRegister).toHaveBeenCalled();
        expect(handlers.afterRegister).toHaveBeenCalled();
        expect(handlers.beforeUnregister).toHaveBeenCalled();
        expect(handlers.afterUnregister).toHaveBeenCalled();
    });
});

// ─── getStats ─────────────────────────────────────────────────────────────────

describe('getStats', () => {
    it('returns zero counts and empty plugins array when registry is empty', () => {
        expect(registry.getStats()).toEqual({ total: 0, enabled: 0, disabled: 0, plugins: [] });
    });

    it('correctly counts total, enabled, disabled', () => {
        registry.registerPlugin({ name: 'e1' });
        registry.registerPlugin({ name: 'e2' });
        registry.registerPlugin({ name: 'd1', enabled: false });
        const stats = registry.getStats();
        expect(stats.total).toBe(3);
        expect(stats.enabled).toBe(2);
        expect(stats.disabled).toBe(1);
    });

    it('each plugin summary contains name, version, enabled, priority only', () => {
        registry.registerPlugin({ name: 'stat', version: '3.0.0', priority: 42 });
        const [p] = registry.getStats().plugins;
        expect(p).toEqual({ name: 'stat', version: '3.0.0', enabled: true, priority: 42 });
        // Should not expose internal fields
        expect(p._registeredAt).toBeUndefined();
        expect(p.middleware).toBeUndefined();
    });

    it('returns plugins sorted by priority', () => {
        registry.registerPlugin({ name: 'z', priority: 300 });
        registry.registerPlugin({ name: 'a', priority: 5 });
        expect(registry.getStats().plugins.map(p => p.name)).toEqual(['a', 'z']);
    });

    it('reflects enable/disable state changes', () => {
        registry.registerPlugin({ name: 'toggle' });
        registry.disablePlugin('toggle');
        const stats = registry.getStats();
        expect(stats.enabled).toBe(0);
        expect(stats.disabled).toBe(1);
        expect(stats.plugins[0].enabled).toBe(false);
    });
});

// ─── module exports ───────────────────────────────────────────────────────────

describe('module exports', () => {
    it('exports all expected functions', () => {
        const fns = [
            'registerPlugin', 'unregisterPlugin', 'getPlugin', 'getAllPlugins',
            'getEnabledPlugins', 'enablePlugin', 'disablePlugin',
            'getPluginMiddleware', 'applyPluginRoutes', 'on', 'getStats',
        ];
        for (const fn of fns) {
            expect(typeof registry[fn]).toBe('function');
        }
    });
});
