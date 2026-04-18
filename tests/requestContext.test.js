'use strict';

const express = require('express');
const request = require('supertest');

const app = require('../src/backend/app');
const requestContext = require('../src/backend/middlewares/requestContext');
const requestLogger = require('../src/backend/middlewares/requestLogger');
const errorHandler = require('../src/backend/middlewares/errorHandler');
const { store } = require('../src/backend/utils/requestStore');

describe('request context', () => {
    it('adds x-request-id to API responses', async () => {
        const res = await request(app).get('/api/read/health');

        expect(res.statusCode).toBe(200);
        expect(res.headers['x-request-id']).toBeDefined();
        expect(res.headers['x-request-id']).not.toHaveLength(0);
    });

    it('reuses inbound x-request-id', async () => {
        const res = await request(app)
            .get('/api/read/health')
            .set('x-request-id', 'req-test-123');

        expect(res.statusCode).toBe(200);
        expect(res.headers['x-request-id']).toBe('req-test-123');
    });
});

describe('requestContext ALS propagation', () => {
    it('next() is called inside the ALS context with correct requestId', (done) => {
        const req = { get: () => 'als-test-id' };
        const res = { locals: {}, setHeader: () => {} };

        requestContext(req, res, () => {
            const ctx = store.getStore();
            expect(ctx).toBeDefined();
            expect(ctx.requestId).toBe('als-test-id');
            done();
        });
    });

    it('store.getStore() is undefined outside the middleware call', () => {
        // Outside any store.run, getStore() should return undefined
        const ctx = store.getStore();
        expect(ctx).toBeUndefined();
    });

    it('x-request-id header is preserved and echoed as requestId in ALS', (done) => {
        const inboundId = 'inbound-preserved-123';
        const req = { get: (h) => (h === 'x-request-id' ? inboundId : undefined) };
        const res = { locals: {}, setHeader: () => {} };

        requestContext(req, res, () => {
            const ctx = store.getStore();
            expect(ctx.requestId).toBe(inboundId);
            expect(req.requestId).toBe(inboundId);
            expect(res.locals.requestId).toBe(inboundId);
            done();
        });
    });
});

describe('error handler request id propagation', () => {
    it('returns requestId in error body', async () => {
        const testApp = express();
        testApp.use(express.json());
        testApp.use(requestContext);
        testApp.use(requestLogger);
        testApp.get('/api/fail', (req, res, next) => next(new Error('boom')));
        testApp.use(errorHandler);

        const res = await request(testApp)
            .get('/api/fail')
            .set('x-request-id', 'req-fail-1');

        expect(res.statusCode).toBe(500);
        expect(res.body.success).toBe(false);
        expect(res.body.requestId).toBe('req-fail-1');
        expect(res.headers['x-request-id']).toBe('req-fail-1');
    });
});
