'use strict';

// Mock heavy dependencies before requiring app
jest.mock('../src/backend/services/agentWatcherService', () => ({ start: jest.fn(), on: jest.fn() }));
jest.mock('../src/backend/services/tsdbService', () => ({
    saveSnapshot: jest.fn(),
    getSystemHistory: jest.fn().mockReturnValue([]),
    getAgentTopTokens: jest.fn().mockReturnValue([]),
    getCostHistory: jest.fn().mockReturnValue([]),
    getAgentActivitySummary: jest.fn().mockReturnValue([]),
}));
jest.mock('../src/backend/services/alertEngine', () => ({ evaluate: jest.fn().mockReturnValue([]) }));
jest.mock('../src/backend/utils/modelMonitor', () => ({ fetchModelCooldowns: jest.fn().mockResolvedValue({}) }));

const request = require('supertest');
const app = require('../src/backend/app');
const errorBuffer = require('../src/backend/services/errorBuffer');

function makeEntry(overrides = {}) {
    return {
        timestamp: '2026-04-19T00:00:00.000Z',
        requestId: 'req-test',
        method: 'POST',
        path: '/api/command',
        statusCode: 500,
        error: 'internal_error',
        durationMs: 55,
        ...overrides,
    };
}

beforeEach(() => {
    errorBuffer.reset();
});

describe('GET /api/read/errors/recent', () => {
    test('returns empty errors array when buffer is empty', async () => {
        const res = await request(app).get('/api/read/errors/recent');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.errors).toEqual([]);
        expect(res.body.total).toBe(0);
    });

    test('returns buffered errors newest-first', async () => {
        errorBuffer.push(makeEntry({ requestId: 'r1', durationMs: 10 }));
        errorBuffer.push(makeEntry({ requestId: 'r2', durationMs: 20 }));
        errorBuffer.push(makeEntry({ requestId: 'r3', durationMs: 30 }));

        const res = await request(app).get('/api/read/errors/recent');
        expect(res.status).toBe(200);
        expect(res.body.total).toBe(3);
        expect(res.body.errors[0].requestId).toBe('r3');
        expect(res.body.errors[1].requestId).toBe('r2');
        expect(res.body.errors[2].requestId).toBe('r1');
    });

    test('limit param restricts number of results', async () => {
        for (let i = 0; i < 10; i++) {
            errorBuffer.push(makeEntry({ requestId: `r${i}` }));
        }
        const res = await request(app).get('/api/read/errors/recent?limit=3');
        expect(res.status).toBe(200);
        expect(res.body.errors).toHaveLength(3);
        expect(res.body.total).toBe(3);
    });

    test('limit > 50 is capped at 50', async () => {
        for (let i = 0; i < 50; i++) {
            errorBuffer.push(makeEntry({ requestId: `r${i}` }));
        }
        const res = await request(app).get('/api/read/errors/recent?limit=200');
        expect(res.status).toBe(200);
        expect(res.body.errors).toHaveLength(50);
    });

    test('limit=0 falls back to default 20', async () => {
        for (let i = 0; i < 30; i++) {
            errorBuffer.push(makeEntry({ requestId: `r${i}` }));
        }
        const res = await request(app).get('/api/read/errors/recent?limit=0');
        expect(res.status).toBe(200);
        expect(res.body.errors).toHaveLength(20);
    });

    test('non-numeric limit falls back to default 20', async () => {
        for (let i = 0; i < 30; i++) {
            errorBuffer.push(makeEntry({ requestId: `r${i}` }));
        }
        const res = await request(app).get('/api/read/errors/recent?limit=abc');
        expect(res.status).toBe(200);
        expect(res.body.errors).toHaveLength(20);
    });

    test('full buffer of 50 entries returned when limit=50', async () => {
        for (let i = 0; i < 50; i++) {
            errorBuffer.push(makeEntry({ requestId: `r${i}` }));
        }
        const res = await request(app).get('/api/read/errors/recent?limit=50');
        expect(res.status).toBe(200);
        expect(res.body.total).toBe(50);
    });

    test('each error entry has expected fields', async () => {
        errorBuffer.push(makeEntry({
            timestamp: '2026-04-19T12:00:00.000Z',
            requestId: 'req-check',
            method: 'DELETE',
            path: '/api/resource/123',
            statusCode: 503,
            error: 'service_unavailable',
            durationMs: 77,
        }));
        const res = await request(app).get('/api/read/errors/recent?limit=1');
        const entry = res.body.errors[0];
        expect(entry.timestamp).toBe('2026-04-19T12:00:00.000Z');
        expect(entry.requestId).toBe('req-check');
        expect(entry.method).toBe('DELETE');
        expect(entry.path).toBe('/api/resource/123');
        expect(entry.statusCode).toBe(503);
        expect(entry.error).toBe('service_unavailable');
        expect(entry.durationMs).toBe(77);
    });
});
