'use strict';

const apiMetrics = require('../src/backend/services/apiMetrics');

beforeEach(() => {
    apiMetrics.reset();
});

describe('apiMetrics', () => {
    test('record + getStats with single sample', () => {
        apiMetrics.record('GET /api/read/health', 42);
        const stats = apiMetrics.getStats();
        expect(stats['GET /api/read/health']).toBeDefined();
        expect(stats['GET /api/read/health'].count).toBe(1);
        expect(stats['GET /api/read/health'].p50).toBe(42);
        expect(stats['GET /api/read/health'].p95).toBe(42);
        expect(stats['GET /api/read/health'].p99).toBe(42);
        expect(stats['GET /api/read/health'].min).toBe(42);
        expect(stats['GET /api/read/health'].max).toBe(42);
        expect(stats['GET /api/read/health'].mean).toBe(42);
    });

    test('500 samples are all retained', () => {
        for (let i = 1; i <= 500; i++) {
            apiMetrics.record('GET /api/test', i);
        }
        const stats = apiMetrics.getStats();
        expect(stats['GET /api/test'].count).toBe(500);
    });

    test('700 samples — oldest 200 dropped, min==201, max==700', () => {
        for (let i = 1; i <= 700; i++) {
            apiMetrics.record('GET /api/sliding', i);
        }
        const stats = apiMetrics.getStats();
        expect(stats['GET /api/sliding'].count).toBe(500);
        expect(stats['GET /api/sliding'].min).toBe(201);
        expect(stats['GET /api/sliding'].max).toBe(700);
    });

    test('multi-endpoint independence', () => {
        apiMetrics.record('GET /api/a', 10);
        apiMetrics.record('GET /api/a', 20);
        apiMetrics.record('POST /api/b', 100);
        const stats = apiMetrics.getStats();
        expect(stats['GET /api/a']).toBeDefined();
        expect(stats['GET /api/a'].count).toBe(2);
        expect(stats['POST /api/b']).toBeDefined();
        expect(stats['POST /api/b'].count).toBe(1);
        expect(stats['POST /api/b'].mean).toBe(100);
    });

    test('p50/p95/p99 with values 1..100', () => {
        for (let i = 1; i <= 100; i++) {
            apiMetrics.record('GET /api/pct', i);
        }
        const stats = apiMetrics.getStats();
        // nearest-rank: floor(100 * 0.50) = 50, sorted[50] = 51
        expect(stats['GET /api/pct'].p50).toBe(51);
        // floor(100 * 0.95) = 95, sorted[95] = 96
        expect(stats['GET /api/pct'].p95).toBe(96);
        // floor(100 * 0.99) = 99, sorted[99] = 100
        expect(stats['GET /api/pct'].p99).toBe(100);
    });

    test('reset() clears all data', () => {
        apiMetrics.record('GET /api/x', 5);
        apiMetrics.reset();
        const stats = apiMetrics.getStats();
        expect(Object.keys(stats)).toHaveLength(0);
    });

    test('record ignores invalid input', () => {
        apiMetrics.record('', 10);           // empty string key
        apiMetrics.record(null, 10);         // non-string key
        apiMetrics.record(123, 10);          // non-string key
        apiMetrics.record('GET /api/y', NaN);        // NaN duration
        apiMetrics.record('GET /api/y', -1);         // negative duration
        apiMetrics.record('GET /api/y', Infinity);   // infinite duration
        const stats = apiMetrics.getStats();
        expect(Object.keys(stats)).toHaveLength(0);
    });

    test('getStats on empty samples returns empty object without crashing', () => {
        const stats = apiMetrics.getStats();
        expect(stats).toEqual({});
    });
});

describe('apiMetrics.recordError + errorCount in getStats', () => {
    test('recordError increments 4xx counter', () => {
        apiMetrics.record('GET /api/x', 10);
        apiMetrics.recordError('GET /api/x', 404);
        const stats = apiMetrics.getStats();
        expect(stats['GET /api/x'].errorCount['4xx']).toBe(1);
        expect(stats['GET /api/x'].errorCount['5xx']).toBe(0);
    });

    test('recordError increments 5xx counter', () => {
        apiMetrics.record('GET /api/x', 10);
        apiMetrics.recordError('GET /api/x', 500);
        apiMetrics.recordError('GET /api/x', 503);
        const stats = apiMetrics.getStats();
        expect(stats['GET /api/x'].errorCount['5xx']).toBe(2);
        expect(stats['GET /api/x'].errorCount['4xx']).toBe(0);
    });

    test('errorCount defaults to 0/0/0 when no errors recorded', () => {
        apiMetrics.record('GET /api/clean', 5);
        const stats = apiMetrics.getStats();
        expect(stats['GET /api/clean'].errorCount).toEqual({ '4xx': 0, '5xx': 0, '429': 0 });
    });

    test('recordError mixed 4xx and 5xx on same key', () => {
        apiMetrics.record('POST /api/mixed', 20);
        apiMetrics.recordError('POST /api/mixed', 400);
        apiMetrics.recordError('POST /api/mixed', 422);
        apiMetrics.recordError('POST /api/mixed', 500);
        const stats = apiMetrics.getStats();
        expect(stats['POST /api/mixed'].errorCount['4xx']).toBe(2);
        expect(stats['POST /api/mixed'].errorCount['5xx']).toBe(1);
    });

    test('recordError ignores statusCode outside 400-599', () => {
        apiMetrics.record('GET /api/y', 10);
        apiMetrics.recordError('GET /api/y', 200);
        apiMetrics.recordError('GET /api/y', 301);
        apiMetrics.recordError('GET /api/y', 600);
        const stats = apiMetrics.getStats();
        expect(stats['GET /api/y'].errorCount).toEqual({ '4xx': 0, '5xx': 0, '429': 0 });
    });

    test('recordError ignores empty key', () => {
        apiMetrics.record('GET /api/z', 10);
        apiMetrics.recordError('', 500);
        apiMetrics.recordError(null, 500);
        const stats = apiMetrics.getStats();
        // 'GET /api/z' should still have zero errors
        expect(stats['GET /api/z'].errorCount).toEqual({ '4xx': 0, '5xx': 0, '429': 0 });
    });

    test('recordError ignores non-integer statusCode', () => {
        apiMetrics.record('GET /api/z', 10);
        apiMetrics.recordError('GET /api/z', 500.5);
        apiMetrics.recordError('GET /api/z', '500');
        apiMetrics.recordError('GET /api/z', NaN);
        const stats = apiMetrics.getStats();
        expect(stats['GET /api/z'].errorCount).toEqual({ '4xx': 0, '5xx': 0, '429': 0 });
    });

    test('reset() clears errorCounts', () => {
        apiMetrics.record('GET /api/r', 10);
        apiMetrics.recordError('GET /api/r', 500);
        apiMetrics.reset();
        const stats = apiMetrics.getStats();
        expect(Object.keys(stats)).toHaveLength(0);
    });

    test('errorCount on key with errors-only (no latency sample yet) — recordError on new key silently ignored before record', () => {
        // recordError on a key that has no latency samples
        // The errorCount map will have the key, but getStats skips keys with no samples
        apiMetrics.recordError('GET /api/nosamples', 500);
        const stats = apiMetrics.getStats();
        // No latency recorded → key should not appear in stats
        expect(stats['GET /api/nosamples']).toBeUndefined();
    });
});

describe('apiMetrics — 429 rate-limit counter', () => {
    test('statusCode=429 increments 429 only — not 4xx', () => {
        apiMetrics.record('GET /api/rl', 10);
        apiMetrics.recordError('GET /api/rl', 429);
        const stats = apiMetrics.getStats();
        expect(stats['GET /api/rl'].errorCount['429']).toBe(1);
        expect(stats['GET /api/rl'].errorCount['4xx']).toBe(0);
        expect(stats['GET /api/rl'].errorCount['5xx']).toBe(0);
    });

    test('statusCode=400 increments 4xx not 429', () => {
        apiMetrics.record('GET /api/rl', 10);
        apiMetrics.recordError('GET /api/rl', 400);
        const stats = apiMetrics.getStats();
        expect(stats['GET /api/rl'].errorCount['4xx']).toBe(1);
        expect(stats['GET /api/rl'].errorCount['429']).toBe(0);
        expect(stats['GET /api/rl'].errorCount['5xx']).toBe(0);
    });

    test('statusCode=503 increments 5xx only', () => {
        apiMetrics.record('GET /api/rl', 10);
        apiMetrics.recordError('GET /api/rl', 503);
        const stats = apiMetrics.getStats();
        expect(stats['GET /api/rl'].errorCount['5xx']).toBe(1);
        expect(stats['GET /api/rl'].errorCount['4xx']).toBe(0);
        expect(stats['GET /api/rl'].errorCount['429']).toBe(0);
    });

    test('getStats returns errorCount with 429 field', () => {
        apiMetrics.record('GET /api/rl', 10);
        const stats = apiMetrics.getStats();
        expect(stats['GET /api/rl'].errorCount).toHaveProperty('429');
    });

    test('multiple 429 errors accumulate correctly', () => {
        apiMetrics.record('GET /api/rl', 10);
        apiMetrics.recordError('GET /api/rl', 429);
        apiMetrics.recordError('GET /api/rl', 429);
        apiMetrics.recordError('GET /api/rl', 429);
        const stats = apiMetrics.getStats();
        expect(stats['GET /api/rl'].errorCount['429']).toBe(3);
        expect(stats['GET /api/rl'].errorCount['4xx']).toBe(0);
    });

    test('statusCode=399 does not trigger any increment', () => {
        apiMetrics.record('GET /api/rl', 10);
        apiMetrics.recordError('GET /api/rl', 399);
        const stats = apiMetrics.getStats();
        expect(stats['GET /api/rl'].errorCount).toEqual({ '4xx': 0, '5xx': 0, '429': 0 });
    });

    test('429 and 4xx and 5xx are all mutually exclusive and accumulate independently', () => {
        apiMetrics.record('POST /api/mixed2', 20);
        apiMetrics.recordError('POST /api/mixed2', 429);
        apiMetrics.recordError('POST /api/mixed2', 429);
        apiMetrics.recordError('POST /api/mixed2', 404);
        apiMetrics.recordError('POST /api/mixed2', 422);
        apiMetrics.recordError('POST /api/mixed2', 500);
        const stats = apiMetrics.getStats();
        expect(stats['POST /api/mixed2'].errorCount['429']).toBe(2);
        expect(stats['POST /api/mixed2'].errorCount['4xx']).toBe(2);
        expect(stats['POST /api/mixed2'].errorCount['5xx']).toBe(1);
    });
});
