'use strict';

const responseSanitizer = require('../src/backend/middlewares/responseSanitizer');

function mockReq(overrides = {}) {
    return { requestId: 'test-req-id', ...overrides };
}

function mockRes() {
    const res = {};
    // Capture the body passed to the original json()
    res._body = undefined;
    res.json = jest.fn((body) => { res._body = body; return res; });
    return res;
}

function applyMiddleware(req, res) {
    return new Promise((resolve) => {
        responseSanitizer(req, res, resolve);
    });
}

describe('responseSanitizer', () => {
    describe('success:true responses — pass through unchanged', () => {
        test('passes through a normal success response untouched', async () => {
            const req = mockReq();
            const res = mockRes();
            await applyMiddleware(req, res);

            const body = { success: true, data: { agents: [] }, message: 'ok' };
            res.json(body);

            // success:true → nothing stripped, even if it has a "message" key
            expect(res._body).toEqual({ success: true, data: { agents: [] }, message: 'ok' });
        });

        test('passes through non-object body unchanged', async () => {
            const req = mockReq();
            const res = mockRes();
            await applyMiddleware(req, res);

            res.json('plain string');
            expect(res._body).toBe('plain string');

            res.json(null);
            expect(res._body).toBeNull();

            res.json(42);
            expect(res._body).toBe(42);
        });
    });

    describe('success:false responses — blocked keys stripped', () => {
        test('strips message from error response', async () => {
            const req = mockReq();
            const res = mockRes();
            await applyMiddleware(req, res);

            res.json({ success: false, error: 'internal_error', message: 'ENOENT: no such file' });

            expect(res._body).toEqual({ success: false, error: 'internal_error' });
            expect(res._body).not.toHaveProperty('message');
        });

        test('strips stack trace from error response', async () => {
            const req = mockReq();
            const res = mockRes();
            await applyMiddleware(req, res);

            res.json({ success: false, error: 'internal_error', stack: 'Error: boom\n    at Object.<anonymous>' });

            expect(res._body).not.toHaveProperty('stack');
        });

        test('strips multiple Node.js Error fields at once', async () => {
            const req = mockReq();
            const res = mockRes();
            await applyMiddleware(req, res);

            res.json({
                success: false,
                error: 'internal_error',
                message: 'connect ECONNREFUSED 127.0.0.1:5432',
                stack: 'Error: ...',
                errno: -61,
                syscall: 'connect',
                address: '127.0.0.1',
                port: 5432,
                code: 'ECONNREFUSED',
                name: 'Error',
            });

            expect(res._body).toEqual({ success: false, error: 'internal_error' });
        });

        test('preserves allowed fields in error response', async () => {
            const req = mockReq();
            const res = mockRes();
            await applyMiddleware(req, res);

            res.json({
                success: false,
                error: 'rate_limited',
                requestId: 'abc-123',
                retryAfter: 30,
            });

            expect(res._body).toEqual({
                success: false,
                error: 'rate_limited',
                requestId: 'abc-123',
                retryAfter: 30,
            });
        });

        test('preserves error code string (our own codes, not Node codes)', async () => {
            const req = mockReq();
            const res = mockRes();
            await applyMiddleware(req, res);

            // Our error codes are stored in the `error` field, not `code`
            // Node.js Error `code` (ENOENT etc.) is blocked
            res.json({ success: false, error: 'sse_capacity_exceeded' });

            expect(res._body).toEqual({ success: false, error: 'sse_capacity_exceeded' });
        });

        test('handles empty body gracefully', async () => {
            const req = mockReq();
            const res = mockRes();
            await applyMiddleware(req, res);

            res.json({ success: false });
            expect(res._body).toEqual({ success: false });
        });
    });

    describe('multiple calls — each response independently sanitized', () => {
        test('sanitizes each res.json() call independently', async () => {
            const req = mockReq();
            const res = mockRes();
            await applyMiddleware(req, res);

            res.json({ success: false, error: 'e1', message: 'leak1' });
            expect(res._body).not.toHaveProperty('message');

            res.json({ success: false, error: 'e2', message: 'leak2' });
            expect(res._body).not.toHaveProperty('message');
        });
    });

    describe('next() called', () => {
        test('calls next() to pass control to the next middleware', async () => {
            const req = mockReq();
            const res = mockRes();
            const next = jest.fn();

            responseSanitizer(req, res, next);
            expect(next).toHaveBeenCalledTimes(1);
        });
    });
});
