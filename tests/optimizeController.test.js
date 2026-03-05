// tests/optimizeController.test.js
'use strict';
const request = require('supertest');
const express = require('express');

jest.mock('../src/backend/services/optimizeService', () => ({
    collectData: jest.fn(async () => ({ costHistory: [], agents: [], alerts: [], existingPlans: [] })),
    runPipeline: jest.fn(async (data, cb) => {
        cb(2, 'Sonnet 起草中...');
        cb(3, 'Opus 審查中...');
        cb(4, 'Sonnet 整合中...');
        return { draft: 'draft', review: 'review', report: '## Report', opusFailed: false };
    }),
    saveAndNotify: jest.fn(async (report, failed, cb) => {
        cb(5, '儲存報告...');
        cb(6, 'Telegram 推播...');
        return { filename: '2026-03-05-auto-optimize.md' };
    }),
}));

const optimizeController = require('../src/backend/controllers/optimizeController');

function buildApp() {
    const app = express();
    app.get('/api/optimize/run', optimizeController.run);
    return app;
}

describe('optimizeController.run', () => {
    beforeEach(() => {
        optimizeController._setRunning(false);
        jest.clearAllMocks();
    });

    it('streams SSE progress events and done event', async () => {
        const res = await request(buildApp())
            .get('/api/optimize/run')
            .buffer(true)
            .parse((res, cb) => {
                let data = '';
                res.on('data', chunk => { data += chunk; });
                res.on('end', () => cb(null, data));
            });

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(/text\/event-stream/);
        expect(res.body).toContain('event: progress');
        expect(res.body).toContain('event: done');
        expect(res.body).toContain('2026-03-05-auto-optimize.md');
    });

    it('returns 409 if already running', async () => {
        optimizeController._setRunning(true);
        const res = await request(buildApp()).get('/api/optimize/run');
        expect(res.status).toBe(409);
    });

    it('streams error event on collectData exception', async () => {
        const optimizeService = require('../src/backend/services/optimizeService');
        optimizeService.collectData.mockRejectedValueOnce(new Error('DB error'));

        const res = await request(buildApp())
            .get('/api/optimize/run')
            .buffer(true)
            .parse((res, cb) => {
                let data = '';
                res.on('data', chunk => { data += chunk; });
                res.on('end', () => cb(null, data));
            });

        expect(res.body).toContain('event: error');
        expect(res.body).toContain('DB error');
    });
});
