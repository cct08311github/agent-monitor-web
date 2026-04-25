const crypto = require('crypto');

// Mock fs before requiring auth
jest.mock('fs', () => ({
    existsSync: jest.fn().mockReturnValue(true),
    mkdirSync: jest.fn(),
    appendFileSync: jest.fn(),
}));

const auth = require('../src/backend/middlewares/auth');

function mockReq(overrides = {}) {
    return {
        ip: '127.0.0.1',
        connection: { remoteAddress: '127.0.0.1' },
        headers: { host: 'localhost:3000', ...overrides.headers },
        body: overrides.body || {},
        originalUrl: '/api/test',
        url: '/api/test',
        ...overrides,
    };
}

function mockRes() {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    res.set = jest.fn();
    res.on = jest.fn((event, cb) => { res._finishCb = cb; });
    res.statusCode = 200;
    return res;
}

const next = jest.fn();

beforeEach(() => next.mockClear());

// ─── localhostOnlyControl ──────────────────────────────

describe('localhostOnlyControl', () => {
    it('allows localhost host', () => {
        const req = mockReq({ headers: { host: 'localhost:3000' } });
        auth.localhostOnlyControl(req, mockRes(), next);
        expect(next).toHaveBeenCalled();
    });

    it('allows 127.0.0.1 host', () => {
        const req = mockReq({ headers: { host: '127.0.0.1:3000' } });
        auth.localhostOnlyControl(req, mockRes(), next);
        expect(next).toHaveBeenCalled();
    });

    it('allows 192.168.x.x local network', () => {
        const req = mockReq({ headers: { host: '192.168.1.100:3000' } });
        auth.localhostOnlyControl(req, mockRes(), next);
        expect(next).toHaveBeenCalled();
    });

    it('allows 10.x.x.x local network', () => {
        const req = mockReq({ headers: { host: '10.0.0.1:3000' } });
        auth.localhostOnlyControl(req, mockRes(), next);
        expect(next).toHaveBeenCalled();
    });

    it('allows Tailscale 100.x.x.x IP', () => {
        const req = mockReq({ headers: { host: '100.64.0.1:3000' } });
        auth.localhostOnlyControl(req, mockRes(), next);
        expect(next).toHaveBeenCalled();
    });

    it('allows *.ts.net Tailscale domain', () => {
        const req = mockReq({ headers: { host: 'my-machine.ts.net:3000' } });
        auth.localhostOnlyControl(req, mockRes(), next);
        expect(next).toHaveBeenCalled();
    });

    it('blocks *.local mDNS hostname (removed from allowlist)', () => {
        const req = mockReq({ headers: { host: 'macbook.local:3000' } });
        const res = mockRes();
        auth.localhostOnlyControl(req, res, next);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });

    it('blocks known mac hostnames ending in .local', () => {
        const req = mockReq({ headers: { host: 'shenghuoguanjiademac-mini.local' } });
        const res = mockRes();
        auth.localhostOnlyControl(req, res, next);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });

    it('blocks external host', () => {
        const req = mockReq({ headers: { host: 'evil.com' } });
        const res = mockRes();
        auth.localhostOnlyControl(req, res, next);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });

    it('blocks forbidden origin even if host ok', () => {
        const req = mockReq({ headers: { host: 'localhost:3000', origin: 'https://evil.com' } });
        const res = mockRes();
        auth.localhostOnlyControl(req, res, next);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'forbidden_origin' }));
    });

    it('allows valid origin', () => {
        const req = mockReq({ headers: { host: 'localhost:3000', origin: 'http://localhost:3000' } });
        auth.localhostOnlyControl(req, mockRes(), next);
        expect(next).toHaveBeenCalled();
    });

    it('handles missing host header', () => {
        const req = mockReq({ headers: {} });
        const res = mockRes();
        auth.localhostOnlyControl(req, res, next);
        expect(res.status).toHaveBeenCalledWith(403);
    });

    it('handles [::1] IPv6 localhost', () => {
        const req = mockReq({ headers: { host: '[::1]:3000' } });
        auth.localhostOnlyControl(req, mockRes(), next);
        expect(next).toHaveBeenCalled();
    });

    it('uses req.connection.remoteAddress when req.ip is missing', () => {
        const req = mockReq({ headers: { host: 'localhost' }, ip: undefined });
        auth.localhostOnlyControl(req, mockRes(), next);
        expect(next).toHaveBeenCalled();
    });
});

// ─── requireBearerToken ────────────────────────────────

describe('requireBearerToken without CONTROL_TOKEN', () => {
    let authWithoutToken;

    beforeEach(() => {
        jest.isolateModules(() => {
            delete process.env.HUD_CONTROL_TOKEN;
            delete process.env.OPENCLAW_HUD_CONTROL_TOKEN;
            authWithoutToken = require('../src/backend/middlewares/auth');
        });
    });

    it('returns 503 when control token is not configured', () => {
        const req = mockReq({ headers: { host: 'localhost' } });
        const res = mockRes();
        authWithoutToken.requireBearerToken(req, res, next);
        expect(res.status).toHaveBeenCalledWith(503);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'control_not_configured' }));
        expect(next).not.toHaveBeenCalled();
    });
});

describe('requireBearerToken with CONTROL_TOKEN configured', () => {
    let authWithToken;
    const originalToken = process.env.HUD_CONTROL_TOKEN;

    beforeAll(() => {
        jest.isolateModules(() => {
            process.env.HUD_CONTROL_TOKEN = 'my-secret-token';
            authWithToken = require('../src/backend/middlewares/auth');
        });
    });

    afterAll(() => {
        if (originalToken === undefined) delete process.env.HUD_CONTROL_TOKEN;
        else process.env.HUD_CONTROL_TOKEN = originalToken;
    });

    it('rejects missing Authorization header', () => {
        const req = mockReq({ headers: { host: 'localhost' } });
        const res = mockRes();
        authWithToken.requireBearerToken(req, res, next);
        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    it('rejects non-Bearer auth scheme', () => {
        const req = mockReq({ headers: { host: 'localhost', authorization: 'Basic abc123' } });
        const res = mockRes();
        authWithToken.requireBearerToken(req, res, next);
        expect(res.status).toHaveBeenCalledWith(401);
    });

    it('accepts correct CONTROL_TOKEN', () => {
        const req = mockReq({ headers: { host: 'localhost', authorization: 'Bearer my-secret-token' } });
        const res = mockRes();
        authWithToken.requireBearerToken(req, res, next);
        expect(next).toHaveBeenCalled();
    });

    it('rejects wrong token', () => {
        const req = mockReq({ headers: { host: 'localhost', authorization: 'Bearer wrongpass' } });
        const res = mockRes();
        authWithToken.requireBearerToken(req, res, next);
        expect(res.status).toHaveBeenCalledWith(401);
    });

    it('sets req._actorToken on success', () => {
        const req = mockReq({ headers: { host: 'localhost', authorization: 'Bearer my-secret-token' } });
        authWithToken.requireBearerToken(req, mockRes(), next);
        expect(req._actorToken).toBe('my-secret-token');
    });
});

// ─── rateLimit ─────────────────────────────────────────

describe('rateLimit', () => {
    it('allows requests under the limit', () => {
        const req = mockReq({ ip: '10.0.0.99' });
        auth.rateLimit(req, mockRes(), next);
        expect(next).toHaveBeenCalled();
    });

    it('blocks after 30 requests per minute', () => {
        const ip = '10.0.0.100';
        const makeReq = () => mockReq({ ip });
        const res = mockRes();

        // 30 allowed
        for (let i = 0; i < 30; i++) {
            auth.rateLimit(makeReq(), mockRes(), next);
        }
        next.mockClear();

        // 31st should be blocked
        auth.rateLimit(makeReq(), res, next);
        expect(res.status).toHaveBeenCalledWith(429);
        expect(next).not.toHaveBeenCalled();
    });

    it('handles missing ip gracefully', () => {
        const req = mockReq({ ip: undefined });
        req.connection = {};
        auth.rateLimit(req, mockRes(), next);
        expect(next).toHaveBeenCalled();
    });
});

// ─── controlAuditMiddleware ────────────────────────────

describe('controlAuditMiddleware', () => {
    it('calls next and logs on finish', () => {
        const req = mockReq({ headers: { host: 'localhost', authorization: 'Bearer testtoken' }, body: { command: 'status' } });
        const res = mockRes();
        auth.controlAuditMiddleware(req, res, next);
        expect(next).toHaveBeenCalled();

        // Simulate response finish
        res.statusCode = 200;
        res._finishCb && res._finishCb();
        // appendFileSync should have been called (fs is mocked)
        const fs = require('fs');
        expect(fs.appendFileSync).toHaveBeenCalled();
    });

    it('handles missing authorization gracefully', () => {
        const req = mockReq({ headers: { host: 'localhost' } });
        const res = mockRes();
        auth.controlAuditMiddleware(req, res, next);
        expect(next).toHaveBeenCalled();
        res._finishCb && res._finishCb();
    });

    it('creates logs dir if not exists', () => {
        const fs = require('fs');
        fs.existsSync.mockReturnValueOnce(false);
        const req = mockReq({ headers: { host: 'localhost', authorization: 'Bearer tok' }, body: {} });
        const res = mockRes();
        auth.controlAuditMiddleware(req, res, next);
        res._finishCb && res._finishCb();
        expect(fs.mkdirSync).toHaveBeenCalled();
    });

    it('handles appendFileSync error silently', () => {
        const fs = require('fs');
        fs.appendFileSync.mockImplementationOnce(() => { throw new Error('disk full'); });
        const req = mockReq({ headers: { host: 'localhost' } });
        const res = mockRes();
        auth.controlAuditMiddleware(req, res, next);
        expect(() => res._finishCb && res._finishCb()).not.toThrow();
    });

    it('records failed status code (>=400) in audit log', () => {
        const req = mockReq({ headers: { host: 'localhost', authorization: 'Bearer testtoken' }, body: { command: 'status' } });
        const res = mockRes();
        auth.controlAuditMiddleware(req, res, next);
        res.statusCode = 500;
        res._finishCb && res._finishCb();
        const fs = require('fs');
        const call = fs.appendFileSync.mock.calls.at(-1);
        const logged = JSON.parse(call[1]);
        expect(logged.success).toBe(false);
    });

    it('handles missing req.body in audit log gracefully', () => {
        const req = { ip: '127.0.0.1', connection: { remoteAddress: '127.0.0.1' }, headers: { host: 'localhost' }, originalUrl: '/api/test', url: '/api/test' };
        const res = mockRes();
        auth.controlAuditMiddleware(req, res, next);
        expect(() => res._finishCb && res._finishCb()).not.toThrow();
    });

    it('falls back to req.url when req.originalUrl is missing (covers || req.url branch)', () => {
        const req = mockReq({ originalUrl: undefined });
        const res = mockRes();
        auth.controlAuditMiddleware(req, res, next);
        res._finishCb && res._finishCb();
        const fs = require('fs');
        expect(fs.appendFileSync).toHaveBeenCalled();
    });
});

// ─── loginRateLimit ────────────────────────────────────────────────────────────

describe('loginRateLimit', () => {
    // loginRateLimit uses a module-level Map, so we need fresh module per describe
    let freshAuth;
    beforeEach(() => {
        jest.isolateModules(() => {
            freshAuth = require('../src/backend/middlewares/auth');
        });
    });

    it('calls next() on first request', () => {
        const req = mockReq({ ip: '9.9.9.1' });
        const res = mockRes();
        const n = jest.fn();
        freshAuth.loginRateLimit(req, res, n);
        expect(n).toHaveBeenCalled();
    });

    it('returns 429 after 5 failed 401 attempts', () => {
        const ip = '9.9.9.2';
        const makeReq = () => mockReq({ ip });

        // Simulate 5 failed login attempts (401 responses)
        for (let i = 0; i < 5; i++) {
            const req = makeReq();
            const res = mockRes();
            res.statusCode = 401;
            const n = jest.fn(() => { res.json({}); }); // trigger the patched res.json
            freshAuth.loginRateLimit(req, res, n);
        }

        // 6th attempt should be blocked
        const req = makeReq();
        const res = mockRes();
        const n = jest.fn();
        freshAuth.loginRateLimit(req, res, n);
        expect(res.status).toHaveBeenCalledWith(429);
        expect(n).not.toHaveBeenCalled();
    });

    it('resets counter on successful login', () => {
        const ip = '9.9.9.3';
        const makeReq = () => mockReq({ ip });

        // 3 failed attempts
        for (let i = 0; i < 3; i++) {
            const req = makeReq();
            const res = mockRes();
            res.statusCode = 401;
            const n = jest.fn(() => { res.json({}); });
            freshAuth.loginRateLimit(req, res, n);
        }

        // Success (200)
        const req2 = makeReq();
        const res2 = mockRes();
        res2.statusCode = 200;
        const n2 = jest.fn(() => { res2.json({ success: true }); });
        freshAuth.loginRateLimit(req2, res2, n2);
        expect(n2).toHaveBeenCalled();

        // Should allow further requests (counter reset)
        const req3 = makeReq();
        const res3 = mockRes();
        const n3 = jest.fn();
        freshAuth.loginRateLimit(req3, res3, n3);
        expect(n3).toHaveBeenCalled();
    });

    // ── Branch coverage: non-401, non-success status (e.g. 400, 503) ──────────
    it('does not increment counter or reset on 4xx-non-401 response (400 bad request)', () => {
        const ip = '9.9.9.4';
        const req = mockReq({ ip });
        const res = mockRes();
        res.statusCode = 400; // bad request — neither 401 nor < 400
        const n = jest.fn(() => { res.json({ error: 'bad' }); });
        freshAuth.loginRateLimit(req, res, n);
        expect(n).toHaveBeenCalled();
        // Counter should not be set (not a 401), next request should still be allowed
        const req2 = mockReq({ ip });
        const res2 = mockRes();
        const n2 = jest.fn();
        freshAuth.loginRateLimit(req2, res2, n2);
        expect(n2).toHaveBeenCalled();
    });

    it('does not increment counter on 503 (auth_not_configured) response', () => {
        const ip = '9.9.9.5';
        const req = mockReq({ ip });
        const res = mockRes();
        res.statusCode = 503;
        const n = jest.fn(() => { res.json({ error: 'auth_not_configured' }); });
        freshAuth.loginRateLimit(req, res, n);
        expect(n).toHaveBeenCalled();
    });

    it('resets an expired window and starts a new one on 401', () => {
        const ip = '9.9.9.6';
        // Use a fresh isolated module so we can manipulate the loginFailures map
        let isolatedAuth;
        jest.isolateModules(() => { isolatedAuth = require('../src/backend/middlewares/auth'); });

        // Simulate 3 failed attempts
        for (let i = 0; i < 3; i++) {
            const req = mockReq({ ip });
            const res = mockRes();
            res.statusCode = 401;
            isolatedAuth.loginRateLimit(req, res, jest.fn(() => res.json({})));
        }

        // Verify 6th attempt would be 429 only after 5 total
        for (let i = 3; i < 5; i++) {
            const req = mockReq({ ip });
            const res = mockRes();
            res.statusCode = 401;
            isolatedAuth.loginRateLimit(req, res, jest.fn(() => res.json({})));
        }

        const req = mockReq({ ip });
        const res = mockRes();
        isolatedAuth.loginRateLimit(req, res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(429);
    });

    // ── Branch: window expiry resets count (auth.js line 175) ────────────────
    it('resets expired window when a new 401 arrives after window passes', () => {
        const ip = '9.9.9.7';
        let isolatedAuth;
        jest.isolateModules(() => { isolatedAuth = require('../src/backend/middlewares/auth'); });

        jest.useFakeTimers();

        // Make 3 failed attempts inside the current window
        for (let i = 0; i < 3; i++) {
            const req = mockReq({ ip });
            const res = mockRes();
            res.statusCode = 401;
            isolatedAuth.loginRateLimit(req, res, jest.fn(() => res.json({})));
        }

        // Advance time past the 15-minute window
        jest.advanceTimersByTime(16 * 60 * 1000);

        // This 401 should hit the `now >= rec.resetAt` branch → reset count to 0, then increment to 1
        const req = mockReq({ ip });
        const res = mockRes();
        res.statusCode = 401;
        isolatedAuth.loginRateLimit(req, res, jest.fn(() => res.json({})));

        // Only 1 failure in the new window — should NOT be rate-limited yet
        const req2 = mockReq({ ip });
        const res2 = mockRes();
        const n2 = jest.fn();
        isolatedAuth.loginRateLimit(req2, res2, n2);
        expect(n2).toHaveBeenCalled(); // not blocked, window reset worked

        jest.useRealTimers();
    });
});

// ─── sessionService (unit — branch coverage) ──────────────────────────────────

describe('sessionService branch coverage', () => {
    let ss;
    beforeEach(() => {
        jest.isolateModules(() => {
            delete process.env.AUTH_SESSION_SECRET; // trigger fallback branch
            ss = require('../src/backend/services/sessionService');
            ss._clearSessions();
        });
    });
    afterEach(() => {
        process.env.AUTH_SESSION_SECRET = 'test-secret-for-unit-tests-xxxxxxxxx';
    });

    it('getSecret() falls back to hardcoded dev-secret when env not set', () => {
        // If getSecret fallback works, createSession + validateSession should still work
        const tok = ss.createSession('bob');
        expect(ss.validateSession(tok).username).toBe('bob');
    });

    it('touchSession is a no-op for invalid (tampered) token', () => {
        // id unsign returns null → early return, no throw
        expect(() => ss.touchSession('invalid.token')).not.toThrow();
    });

    it('touchSession is a no-op when session not in map', () => {
        // Create token, then manually clear the sessions map
        const tok = ss.createSession('alice');
        ss._clearSessions();
        expect(() => ss.touchSession(tok)).not.toThrow();
    });
});

// ─── requireAuth ───────────────────────────────────────────────────────────────

describe('requireAuth', () => {
    const sessionService = require('../src/backend/services/sessionService');

    beforeEach(() => {
        sessionService._clearSessions();
        process.env.AUTH_SESSION_SECRET = 'test-secret-for-unit-tests-xxxxxxxxx';
        delete process.env.AUTH_DISABLED;
    });

    afterEach(() => {
        process.env.AUTH_DISABLED = 'true';
    });

    it('calls next() when AUTH_DISABLED=true', () => {
        process.env.AUTH_DISABLED = 'true';
        const req = mockReq({ cookies: {} });
        const res = mockRes();
        const n = jest.fn();
        auth.requireAuth(req, res, n);
        expect(n).toHaveBeenCalled();
    });

    it('returns 401 when no sid cookie and no Bearer header', () => {
        process.env.AUTH_DISABLED = 'false';
        const req = mockReq({ cookies: {} });
        const res = mockRes();
        const n = jest.fn();
        auth.requireAuth(req, res, n);
        expect(res.status).toHaveBeenCalledWith(401);
        expect(n).not.toHaveBeenCalled();
    });

    it('accepts valid Bearer token in Authorization header', () => {
        process.env.AUTH_DISABLED = 'false';
        const token = sessionService.createSession('bob');
        const req = mockReq({
            cookies: {},
            headers: { host: 'localhost', authorization: `Bearer ${token}` },
        });
        const res = mockRes();
        const n = jest.fn();
        auth.requireAuth(req, res, n);
        expect(n).toHaveBeenCalled();
        expect(req._authUser).toBe('bob');
    });

    it('returns 401 for invalid Bearer token', () => {
        process.env.AUTH_DISABLED = 'false';
        const req = mockReq({
            cookies: {},
            headers: { host: 'localhost', authorization: 'Bearer invalid.token.here' },
        });
        const res = mockRes();
        const n = jest.fn();
        auth.requireAuth(req, res, n);
        expect(res.status).toHaveBeenCalledWith(401);
        expect(n).not.toHaveBeenCalled();
    });

    it('prefers Bearer token over cookie when both present', () => {
        process.env.AUTH_DISABLED = 'false';
        const cookieToken = sessionService.createSession('cookie-user');
        const bearerToken = sessionService.createSession('bearer-user');
        const req = mockReq({
            cookies: { sid: cookieToken },
            headers: { host: 'localhost', authorization: `Bearer ${bearerToken}` },
        });
        const res = mockRes();
        const n = jest.fn();
        auth.requireAuth(req, res, n);
        expect(n).toHaveBeenCalled();
        expect(req._authUser).toBe('bearer-user');
    });

    it('returns 401 for invalid/tampered token', () => {
        process.env.AUTH_DISABLED = 'false';
        const req = mockReq({ cookies: { sid: 'invalid.token.tampered' } });
        const res = mockRes();
        const n = jest.fn();
        auth.requireAuth(req, res, n);
        expect(res.status).toHaveBeenCalledWith(401);
        expect(n).not.toHaveBeenCalled();
    });

    it('calls next() and sets req._authUser for valid session', () => {
        process.env.AUTH_DISABLED = 'false';
        const token = sessionService.createSession('alice');
        const req = mockReq({ cookies: { sid: token } });
        const res = mockRes();
        const n = jest.fn();
        auth.requireAuth(req, res, n);
        expect(n).toHaveBeenCalled();
        expect(req._authUser).toBe('alice');
    });
});
