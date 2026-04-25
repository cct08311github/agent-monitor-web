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
jest.mock('../src/backend/services/alertEngine', () => ({
    evaluate: jest.fn().mockReturnValue([]),
    getRecent: jest.fn().mockReturnValue([]),
}));
jest.mock('../src/backend/utils/modelMonitor', () => ({ fetchModelCooldowns: jest.fn().mockResolvedValue({}) }));
jest.mock('../src/backend/services/insightsService', () => ({
    buildInsights: jest.fn().mockReturnValue([]),
}));

const request = require('supertest');
const app = require('../src/backend/app');
const insightsService = require('../src/backend/services/insightsService');

describe('GET /api/read/insights', () => {
    beforeEach(() => {
        insightsService.buildInsights.mockReturnValue([]);
    });

    it('returns 200 with empty insights array when no heuristics fire', async () => {
        const res = await request(app).get('/api/read/insights');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.insights).toEqual([]);
        expect(typeof res.body.generated_at).toBe('number');
    });

    it('returns insights when heuristics fire', async () => {
        const mockInsights = [
            {
                type: 'alert_storm',
                severity: 'critical',
                message: '告警風暴：1 小時內 15 條 alert',
                ts: Date.now(),
                meta: { count: 15 },
            },
            {
                type: 'p99_spike',
                severity: 'warning',
                message: 'GET /api/slow p99 延遲 3500ms（高延遲警告）',
                ts: Date.now(),
                meta: { endpoint: 'GET /api/slow', p99: 3500 },
            },
        ];
        insightsService.buildInsights.mockReturnValue(mockInsights);

        const res = await request(app).get('/api/read/insights');
        expect(res.status).toBe(200);
        expect(res.body.insights).toHaveLength(2);
        expect(res.body.insights[0].type).toBe('alert_storm');
        expect(res.body.insights[0].severity).toBe('critical');
    });

    it('returns 500 when insightsService throws', async () => {
        insightsService.buildInsights.mockImplementation(() => {
            throw new Error('unexpected failure');
        });
        const res = await request(app).get('/api/read/insights');
        expect(res.status).toBe(500);
    });

    it('includes generated_at timestamp in response', async () => {
        const before = Date.now();
        const res = await request(app).get('/api/read/insights');
        const after = Date.now();
        expect(res.body.generated_at).toBeGreaterThanOrEqual(before);
        expect(res.body.generated_at).toBeLessThanOrEqual(after);
    });
});
