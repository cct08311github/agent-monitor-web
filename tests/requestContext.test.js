'use strict';

const express = require('express');
const request = require('supertest');

const app = require('../src/backend/app');
const requestContext = require('../src/backend/middlewares/requestContext');
const requestLogger = require('../src/backend/middlewares/requestLogger');
const errorHandler = require('../src/backend/middlewares/errorHandler');

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
