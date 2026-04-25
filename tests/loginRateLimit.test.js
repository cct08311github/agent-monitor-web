'use strict';

const { loginRateLimit } = require('../src/backend/middlewares/loginRateLimit');

// ─── helpers ──────────────────────────────────────────────────────────────────

function mockReq(overrides = {}) {
    return {
        ip: '10.0.0.1',
        connection: { remoteAddress: '10.0.0.1' },
        ...overrides,
    };
}

function mockRes() {
    const headers = {};
    const res = {
        _headers: headers,
        statusCode: 200,
    };
    res.set = jest.fn((key, value) => { headers[key] = value; });
    res.status = jest.fn((code) => { res.statusCode = code; return res; });
    res.json = jest.fn((body) => { res._body = body; return res; });
    return res;
}

// ─── tests ────────────────────────────────────────────────────────────────────

describe('loginRateLimit — RateLimit-* headers', () => {
    // Reset the loginFailures Map between tests by using different IPs per test
    // to avoid inter-test state pollution without re-requiring the module.

    it('first request sets RateLimit-Remaining to LOGIN_MAX_ATTEMPTS (5)', () => {
        const req = mockReq({ ip: '10.1.0.1', connection: { remoteAddress: '10.1.0.1' } });
        const res = mockRes();
        const next = jest.fn();

        loginRateLimit(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(res.set).toHaveBeenCalledWith('RateLimit-Limit', '5');
        expect(res.set).toHaveBeenCalledWith('RateLimit-Remaining', '5');
        expect(res.set).toHaveBeenCalledWith('RateLimit-Reset', expect.any(String));
    });

    it('after one failed attempt Remaining decrements to 4', () => {
        const ip = '10.1.0.2';
        const req = mockReq({ ip, connection: { remoteAddress: ip } });
        const next = jest.fn();

        // First call — no failures yet
        const res1 = mockRes();
        loginRateLimit(req, res1, next);
        // Simulate a 401 response which triggers failure recording
        res1.statusCode = 401;
        res1.json({ success: false, error: 'invalid_credentials' });

        // Second call — 1 failure recorded
        const res2 = mockRes();
        loginRateLimit(req, res2, next);

        const remaining = res2._headers['RateLimit-Remaining'];
        expect(Number(remaining)).toBe(4);
        expect(res2._headers['RateLimit-Limit']).toBe('5');
    });

    it('returns 429 with Retry-After header when limit is exceeded', () => {
        const ip = '10.1.0.3';
        const reqBase = { ip, connection: { remoteAddress: ip } };
        const req = mockReq(reqBase);
        const next = jest.fn();
        const LOGIN_MAX_ATTEMPTS = 5;

        // Exhaust all attempts by simulating LOGIN_MAX_ATTEMPTS failures
        for (let i = 0; i < LOGIN_MAX_ATTEMPTS; i++) {
            const res = mockRes();
            loginRateLimit(req, res, next);
            res.statusCode = 401;
            res.json({ success: false });
        }

        // Next call should hit 429
        const res429 = mockRes();
        loginRateLimit(req, res429, next);

        expect(res429.status).toHaveBeenCalledWith(429);
        expect(res429._headers['RateLimit-Remaining']).toBe('0');
        expect(res429._headers['Retry-After']).toBeDefined();
        expect(Number(res429._headers['Retry-After'])).toBeGreaterThan(0);
        const body = res429.json.mock.calls[0][0];
        expect(body.error).toBe('too_many_attempts');
    });

    it('after successful login RateLimit-Remaining resets to 5', () => {
        const ip = '10.1.0.4';
        const req = mockReq({ ip, connection: { remoteAddress: ip } });
        const next = jest.fn();

        // Record 2 failures
        for (let i = 0; i < 2; i++) {
            const res = mockRes();
            loginRateLimit(req, res, next);
            res.statusCode = 401;
            res.json({ success: false });
        }

        // Simulate a successful login (200) which clears the record
        const resOk = mockRes();
        loginRateLimit(req, resOk, next);
        resOk.statusCode = 200;
        resOk.json({ success: true });

        // Next request — slate should be clean
        const resAfter = mockRes();
        loginRateLimit(req, resAfter, next);

        expect(resAfter._headers['RateLimit-Remaining']).toBe('5');
    });
});
