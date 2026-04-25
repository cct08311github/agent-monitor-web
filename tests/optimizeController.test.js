// tests/optimizeController.test.js
'use strict';
const request = require('supertest');
const express = require('express');

jest.mock('../src/backend/services/optimizeService', () => ({
    collectData: jest.fn(async () => ({ costHistory: [], agents: [], alerts: [], existingPlans: [] })),
    runPipeline: jest.fn(async (data, cb) => {
        cb(2, 'Sonnet 起草中...');
        cb(3, 'Opus 審查草案中...');
        cb(4, 'Opus Code Review 中...');
        cb(5, 'Sonnet 整合中...');
        return { draft: 'draft', review: 'review', codeReview: 'code review', report: '## Report', opusFailed: false };
    }),
    saveAndNotify: jest.fn(async (report, failed, cb) => {
        cb(6, '儲存報告...');
        cb(7, 'Telegram 推播...');
        return { filename: '2026-03-05-auto-optimize.md' };
    }),
}));

jest.mock('../src/backend/services/optimizeHistoryService', () => ({
    listHistory: jest.fn(async () => [
        { filename: '2026-04-25-auto-optimize.md', date: '2026-04-25', size_bytes: 1024 },
        { filename: '2026-04-20-auto-optimize.md', date: '2026-04-20', size_bytes: 512 },
    ]),
    readPlan: jest.fn(async (filename) => {
        if (filename === '2026-04-25-auto-optimize.md') {
            return '# Auto-Optimize Report\n\nContent here.';
        }
        return null;
    }),
}));

const optimizeController = require('../src/backend/controllers/optimizeController');

function buildApp() {
    const app = express();
    app.get('/api/optimize/run', optimizeController.run);
    app.get('/api/optimize/history', optimizeController.getHistory.bind(optimizeController));
    app.get('/api/optimize/result/:filename', optimizeController.getResult.bind(optimizeController));
    return app;
}

describe('optimizeController.run', () => {
    beforeEach(() => {
        optimizeController._setRunning(false);
        optimizeController._resetCooldown();
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
        // H1: error message is sanitized — raw error details are not exposed to clients
        expect(res.body).toContain('優化執行失敗，請稍後再試');
        expect(res.body).not.toContain('DB error');
    });

    it('resets isRunning to false after error so subsequent requests succeed', async () => {
        const optimizeService = require('../src/backend/services/optimizeService');
        optimizeService.collectData.mockRejectedValueOnce(new Error('transient error'));

        await request(buildApp())
            .get('/api/optimize/run')
            .buffer(true)
            .parse((res, cb) => {
                let data = '';
                res.on('data', chunk => { data += chunk; });
                res.on('end', () => cb(null, data));
            });

        // After error, isRunning must be false — next request should not get 409
        const res2 = await request(buildApp()).get('/api/optimize/run');
        expect(res2.status).not.toBe(409);
    });
});

// ---------------------------------------------------------------------------
// optimizeController.getHistory
// ---------------------------------------------------------------------------

describe('optimizeController.getHistory', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('returns 200 with history array', async () => {
        const res = await request(buildApp()).get('/api/optimize/history');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.history)).toBe(true);
        expect(res.body.history).toHaveLength(2);
        expect(res.body.history[0].filename).toBe('2026-04-25-auto-optimize.md');
    });

    it('returns 500 on service error', async () => {
        const histSvc = require('../src/backend/services/optimizeHistoryService');
        histSvc.listHistory.mockRejectedValueOnce(new Error('disk error'));

        const res = await request(buildApp()).get('/api/optimize/history');
        expect(res.status).toBe(500);
        expect(res.body.success).toBe(false);
        expect(res.body.error).toBe('internal_error');
        // Must not leak internal error details
        expect(JSON.stringify(res.body)).not.toContain('disk error');
    });
});

// ---------------------------------------------------------------------------
// optimizeController.getResult
// ---------------------------------------------------------------------------

describe('optimizeController.getResult', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('returns 200 with content for a valid existing file', async () => {
        const res = await request(buildApp()).get('/api/optimize/result/2026-04-25-auto-optimize.md');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.filename).toBe('2026-04-25-auto-optimize.md');
        expect(typeof res.body.content).toBe('string');
        expect(res.body.content).toContain('Auto-Optimize Report');
    });

    it('returns 404 for a valid filename that does not exist', async () => {
        const res = await request(buildApp()).get('/api/optimize/result/2026-01-01-auto-optimize.md');
        expect(res.status).toBe(404);
        expect(res.body.success).toBe(false);
        expect(res.body.error).toBe('not_found');
    });

    it('returns 400 for path traversal attempt', async () => {
        const histSvc = require('../src/backend/services/optimizeHistoryService');
        const err = new Error('invalid_filename');
        err.code = 'invalid_filename';
        histSvc.readPlan.mockRejectedValueOnce(err);

        const res = await request(buildApp()).get('/api/optimize/result/..%2Fetc%2Fpasswd');
        expect(res.status).toBe(400);
        expect(res.body.error).toBe('invalid_filename');
    });

    it('returns 400 for filename not matching expected pattern', async () => {
        const histSvc = require('../src/backend/services/optimizeHistoryService');
        const err = new Error('invalid_filename');
        err.code = 'invalid_filename';
        histSvc.readPlan.mockRejectedValueOnce(err);

        const res = await request(buildApp()).get('/api/optimize/result/report.md');
        expect(res.status).toBe(400);
        expect(res.body.error).toBe('invalid_filename');
    });
});
