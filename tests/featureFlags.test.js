'use strict';

jest.mock('../src/backend/utils/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
}));

const logger = require('../src/backend/utils/logger');

const {
    getAllFlags,
    getFlag,
    isEnabled,
    updateFlag,
    resetFlags,
    featureFlag,
    featureConditional,
    getStats,
    DEFAULT_FLAGS,
} = require('../src/backend/middlewares/featureFlags');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mockReq(overrides = {}) {
    return { path: '/test', ip: '127.0.0.1', ...overrides };
}

function mockRes() {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
}

// ─── State reset ──────────────────────────────────────────────────────────────

afterEach(() => {
    resetFlags();
    jest.clearAllMocks();
});

// ─── DEFAULT_FLAGS ────────────────────────────────────────────────────────────

describe('DEFAULT_FLAGS', () => {
    it('exists and is an object', () => {
        expect(DEFAULT_FLAGS).toBeDefined();
        expect(typeof DEFAULT_FLAGS).toBe('object');
        expect(DEFAULT_FLAGS).not.toBeNull();
    });

    it('contains expected core flag keys', () => {
        const expectedKeys = ['dashboard', 'alerts', 'taskhub', 'cron', 'optimize', 'watchdog'];
        for (const key of expectedKeys) {
            expect(DEFAULT_FLAGS).toHaveProperty(key);
        }
    });

    it('contains expected beta/streaming flag keys', () => {
        const expectedKeys = ['sseStream', 'charts', 'logsStream'];
        for (const key of expectedKeys) {
            expect(DEFAULT_FLAGS).toHaveProperty(key);
        }
    });

    it('each flag has enabled (boolean) and description (string) fields', () => {
        for (const [name, flag] of Object.entries(DEFAULT_FLAGS)) {
            expect(typeof flag.enabled).toBe('boolean', `${name}.enabled should be boolean`);
            expect(typeof flag.description).toBe('string', `${name}.description should be string`);
        }
    });

    it('all default flags are enabled', () => {
        for (const [name, flag] of Object.entries(DEFAULT_FLAGS)) {
            expect(flag.enabled).toBe(true, `${name} should be enabled by default`);
        }
    });
});

// ─── getAllFlags ───────────────────────────────────────────────────────────────

describe('getAllFlags', () => {
    it('returns all flags matching defaults on fresh state', () => {
        const all = getAllFlags();
        expect(Object.keys(all)).toEqual(expect.arrayContaining(Object.keys(DEFAULT_FLAGS)));
    });

    it('returns a copy — mutations do not affect internal state', () => {
        const all = getAllFlags();
        all.dashboard = { enabled: false, description: 'mutated' };

        // Internal state should still reflect the original
        const all2 = getAllFlags();
        expect(all2.dashboard.enabled).toBe(true);
    });

    it('reflects updates after updateFlag', () => {
        updateFlag('dashboard', { enabled: false });
        const all = getAllFlags();
        expect(all.dashboard.enabled).toBe(false);
    });
});

// ─── getFlag ──────────────────────────────────────────────────────────────────

describe('getFlag', () => {
    it('returns the flag object for a known flag', () => {
        const flag = getFlag('dashboard');
        expect(flag).toBeDefined();
        expect(typeof flag.enabled).toBe('boolean');
        expect(typeof flag.description).toBe('string');
    });

    it('returns undefined for a non-existing flag', () => {
        expect(getFlag('nonExistentFlag')).toBeUndefined();
    });

    it('returns the correct flag for each default key', () => {
        for (const key of Object.keys(DEFAULT_FLAGS)) {
            const flag = getFlag(key);
            expect(flag).toBeDefined();
            expect(flag.enabled).toBe(DEFAULT_FLAGS[key].enabled);
        }
    });
});

// ─── isEnabled ────────────────────────────────────────────────────────────────

describe('isEnabled', () => {
    it('returns true for an enabled flag', () => {
        expect(isEnabled('dashboard')).toBe(true);
    });

    it('returns true for all default flags (all are enabled)', () => {
        for (const key of Object.keys(DEFAULT_FLAGS)) {
            expect(isEnabled(key)).toBe(true);
        }
    });

    it('returns false for a non-existing flag', () => {
        expect(isEnabled('doesNotExist')).toBe(false);
    });

    it('returns false after disabling a flag', () => {
        updateFlag('alerts', { enabled: false });
        expect(isEnabled('alerts')).toBe(false);
    });

    it('returns true after re-enabling a disabled flag', () => {
        updateFlag('alerts', { enabled: false });
        updateFlag('alerts', { enabled: true });
        expect(isEnabled('alerts')).toBe(true);
    });
});

// ─── updateFlag ───────────────────────────────────────────────────────────────

describe('updateFlag', () => {
    it('updates enabled on an existing flag and returns true', () => {
        const result = updateFlag('dashboard', { enabled: false });
        expect(result).toBe(true);
        expect(isEnabled('dashboard')).toBe(false);
    });

    it('updates description on an existing flag', () => {
        updateFlag('dashboard', { description: 'New description' });
        expect(getFlag('dashboard').description).toBe('New description');
    });

    it('updates both enabled and description together', () => {
        updateFlag('optimize', { enabled: false, description: 'Disabled optimize' });
        const flag = getFlag('optimize');
        expect(flag.enabled).toBe(false);
        expect(flag.description).toBe('Disabled optimize');
    });

    it('ignores non-boolean enabled values (does not overwrite)', () => {
        const before = getFlag('dashboard').enabled;
        updateFlag('dashboard', { enabled: 'yes' }); // non-boolean
        expect(getFlag('dashboard').enabled).toBe(before);
    });

    it('ignores non-string description values (does not overwrite)', () => {
        const before = getFlag('dashboard').description;
        updateFlag('dashboard', { description: 42 }); // non-string
        expect(getFlag('dashboard').description).toBe(before);
    });

    it('rejects updating a non-existing flag without experimental_ prefix and returns false', () => {
        const result = updateFlag('unknownFlag', { enabled: false });
        expect(result).toBe(false);
        expect(getFlag('unknownFlag')).toBeUndefined();
    });

    it('logs a warning when rejecting a non-existing non-experimental flag', () => {
        updateFlag('unknownFlag', { enabled: false });
        expect(logger.warn).toHaveBeenCalledWith('feature_flag_unknown', { name: 'unknownFlag' });
    });

    it('allows creating a new flag with experimental_ prefix and returns true', () => {
        const result = updateFlag('experimental_newFeature', { enabled: true, description: 'A new exp feature' });
        expect(result).toBe(true);
        expect(getFlag('experimental_newFeature')).toBeDefined();
        expect(isEnabled('experimental_newFeature')).toBe(true);
    });

    it('experimental_ flag stores enabled and description correctly', () => {
        updateFlag('experimental_beta', { enabled: false, description: 'Beta test' });
        const flag = getFlag('experimental_beta');
        expect(flag.enabled).toBe(false);
        expect(flag.description).toBe('Beta test');
    });

    it('whitelist: only applies enabled and description — no extra arbitrary fields', () => {
        updateFlag('dashboard', { enabled: false, description: 'safe', hack: 'injected' });
        const flag = getFlag('dashboard');
        // Verify legitimate fields updated
        expect(flag.enabled).toBe(false);
        expect(flag.description).toBe('safe');
        // Arbitrary field should NOT be present
        expect(flag).not.toHaveProperty('hack');
    });

    it('logs info after a successful update', () => {
        updateFlag('charts', { enabled: false });
        expect(logger.info).toHaveBeenCalledWith('feature_flag_updated', expect.objectContaining({ name: 'charts' }));
    });
});

// ─── resetFlags ───────────────────────────────────────────────────────────────

describe('resetFlags', () => {
    it('restores all flags to defaults after modifications', () => {
        updateFlag('dashboard', { enabled: false });
        updateFlag('alerts', { description: 'Changed' });
        updateFlag('experimental_temp', { enabled: true });

        resetFlags();

        // Core flags restored
        expect(isEnabled('dashboard')).toBe(true);
        expect(getFlag('alerts').description).toBe(DEFAULT_FLAGS.alerts.description);
        // Experimental flag gone
        expect(getFlag('experimental_temp')).toBeUndefined();
    });

    it('getAllFlags returns exactly the default set after reset', () => {
        updateFlag('cron', { enabled: false });
        resetFlags();

        const all = getAllFlags();
        expect(Object.keys(all).sort()).toEqual(Object.keys(DEFAULT_FLAGS).sort());
    });

    it('logs info on reset', () => {
        resetFlags();
        expect(logger.info).toHaveBeenCalledWith('feature_flags_reset');
    });

    it('after reset isEnabled returns true for all default flags', () => {
        for (const key of Object.keys(DEFAULT_FLAGS)) {
            updateFlag(key, { enabled: false });
        }
        resetFlags();
        for (const key of Object.keys(DEFAULT_FLAGS)) {
            expect(isEnabled(key)).toBe(true);
        }
    });
});

// ─── featureFlag middleware ────────────────────────────────────────────────────

describe('featureFlag middleware', () => {
    it('calls next() when the feature is enabled', () => {
        const middleware = featureFlag('dashboard');
        const req = mockReq();
        const res = mockRes();
        const next = jest.fn();

        middleware(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(res.status).not.toHaveBeenCalled();
    });

    it('returns 404 JSON when the feature is disabled', () => {
        updateFlag('optimize', { enabled: false });
        const middleware = featureFlag('optimize');
        const req = mockReq();
        const res = mockRes();
        const next = jest.fn();

        middleware(req, res, next);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            success: false,
            error: 'feature_not_available',
        }));
        expect(next).not.toHaveBeenCalled();
    });

    it('404 response message mentions the feature name', () => {
        updateFlag('charts', { enabled: false });
        const middleware = featureFlag('charts');
        const req = mockReq();
        const res = mockRes();
        const next = jest.fn();

        middleware(req, res, next);

        const jsonArg = res.json.mock.calls[0][0];
        expect(jsonArg.message).toContain('charts');
    });

    it('returns 404 for a non-existing feature flag', () => {
        const middleware = featureFlag('neverExisted');
        const req = mockReq();
        const res = mockRes();
        const next = jest.fn();

        middleware(req, res, next);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(next).not.toHaveBeenCalled();
    });

    it('logs a warning when access is blocked for a disabled feature', () => {
        updateFlag('logsStream', { enabled: false });
        const middleware = featureFlag('logsStream');
        middleware(mockReq(), mockRes(), jest.fn());

        expect(logger.warn).toHaveBeenCalledWith('feature_flag_disabled_access', expect.objectContaining({
            feature: 'logsStream',
        }));
    });

    it('does NOT log a warning when feature is enabled and next() is called', () => {
        const middleware = featureFlag('sseStream');
        middleware(mockReq(), mockRes(), jest.fn());

        expect(logger.warn).not.toHaveBeenCalledWith('feature_flag_disabled_access', expect.anything());
    });
});

// ─── featureConditional middleware ────────────────────────────────────────────

describe('featureConditional middleware', () => {
    it('calls inner middleware when the feature is enabled', () => {
        const innerMiddleware = jest.fn((req, res, next) => next());
        const conditional = featureConditional('dashboard', innerMiddleware);
        const req = mockReq();
        const res = mockRes();
        const next = jest.fn();

        conditional(req, res, next);

        expect(innerMiddleware).toHaveBeenCalledTimes(1);
        expect(innerMiddleware).toHaveBeenCalledWith(req, res, next);
    });

    it('skips inner middleware and calls next() when the feature is disabled', () => {
        updateFlag('charts', { enabled: false });
        const innerMiddleware = jest.fn();
        const conditional = featureConditional('charts', innerMiddleware);
        const req = mockReq();
        const res = mockRes();
        const next = jest.fn();

        conditional(req, res, next);

        expect(innerMiddleware).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledTimes(1);
    });

    it('skips inner middleware for a non-existing feature and calls next()', () => {
        const innerMiddleware = jest.fn();
        const conditional = featureConditional('nonExistent', innerMiddleware);
        const req = mockReq();
        const res = mockRes();
        const next = jest.fn();

        conditional(req, res, next);

        expect(innerMiddleware).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledTimes(1);
    });

    it('passes req, res, next to the inner middleware', () => {
        const innerMiddleware = jest.fn();
        const conditional = featureConditional('taskhub', innerMiddleware);
        const req = mockReq({ path: '/api/taskhub' });
        const res = mockRes();
        const next = jest.fn();

        conditional(req, res, next);

        expect(innerMiddleware).toHaveBeenCalledWith(req, res, next);
    });

    it('inner middleware result propagates (e.g., calling next from inner)', () => {
        const innerMiddleware = jest.fn((req, res, next) => next());
        const conditional = featureConditional('cron', innerMiddleware);
        const req = mockReq();
        const res = mockRes();
        const next = jest.fn();

        conditional(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
    });
});

// ─── getStats ─────────────────────────────────────────────────────────────────

describe('getStats', () => {
    it('returns total equal to the number of current flags', () => {
        const stats = getStats();
        expect(stats.total).toBe(Object.keys(DEFAULT_FLAGS).length);
    });

    it('enabled + disabled equals total', () => {
        const stats = getStats();
        expect(stats.enabled + stats.disabled).toBe(stats.total);
    });

    it('all flags enabled by default — enabled equals total, disabled equals 0', () => {
        const stats = getStats();
        expect(stats.enabled).toBe(stats.total);
        expect(stats.disabled).toBe(0);
    });

    it('disabled count increases after disabling a flag', () => {
        updateFlag('dashboard', { enabled: false });
        const stats = getStats();
        expect(stats.disabled).toBe(1);
        expect(stats.enabled).toBe(stats.total - 1);
    });

    it('disabled count increases for each disabled flag', () => {
        updateFlag('dashboard', { enabled: false });
        updateFlag('alerts', { enabled: false });
        const stats = getStats();
        expect(stats.disabled).toBe(2);
        expect(stats.enabled).toBe(stats.total - 2);
    });

    it('flags array contains name, enabled, and description fields', () => {
        const { flags } = getStats();
        expect(Array.isArray(flags)).toBe(true);
        for (const f of flags) {
            expect(f).toHaveProperty('name');
            expect(f).toHaveProperty('enabled');
            expect(f).toHaveProperty('description');
        }
    });

    it('flags array length matches total', () => {
        const stats = getStats();
        expect(stats.flags.length).toBe(stats.total);
    });

    it('includes experimental flags added via updateFlag in stats', () => {
        updateFlag('experimental_foo', { enabled: true, description: 'Foo' });
        const stats = getStats();
        expect(stats.total).toBe(Object.keys(DEFAULT_FLAGS).length + 1);
        const expFlag = stats.flags.find(f => f.name === 'experimental_foo');
        expect(expFlag).toBeDefined();
        expect(expFlag.enabled).toBe(true);
    });

    it('description defaults to empty string when flag has no description', () => {
        // Simulate a flag with no description by using experimental_ prefix
        updateFlag('experimental_nodesc', { enabled: true });
        const stats = getStats();
        const flag = stats.flags.find(f => f.name === 'experimental_nodesc');
        // description is undefined on newly created flag before any description set
        expect(typeof flag.description).toBe('string');
    });
});
