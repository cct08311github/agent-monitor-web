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
