// tests/authIntegration.test.js
// Integration tests for sessionService + authController via HTTP
'use strict';

const request = require('supertest');

// Override global AUTH_DISABLED=true from setup.js
beforeAll(() => { process.env.AUTH_DISABLED = 'false'; });
afterAll(() => { process.env.AUTH_DISABLED = 'true'; });

// ── sessionService unit tests ─────────────────────────────────────────────────
describe('sessionService', () => {
    let sessionService;
    beforeEach(() => {
        jest.resetModules();
        process.env.AUTH_SESSION_SECRET = 'test-secret';
        process.env.AUTH_SESSION_TTL_HOURS = '8';
        sessionService = require('../src/backend/services/sessionService');
        sessionService._clearSessions();
    });

    it('createSession returns signed token with dot', () => {
        const tok = sessionService.createSession('alice');
        expect(typeof tok).toBe('string');
        expect(tok).toContain('.');
    });

    it('validateSession returns session for valid token', () => {
        const tok = sessionService.createSession('alice');
        expect(sessionService.validateSession(tok).username).toBe('alice');
    });

    it('validateSession returns null for tampered token', () => {
        const tok = sessionService.createSession('alice');
        expect(sessionService.validateSession(tok.slice(0, -3) + 'xxx')).toBeNull();
    });

    it('validateSession returns null for expired session', () => {
        const tok = sessionService.createSession('alice');
        for (const s of sessionService._sessions.values()) s.expiresAt = Date.now() - 1;
        expect(sessionService.validateSession(tok)).toBeNull();
    });

    it('touchSession extends expiry', () => {
        const tok = sessionService.createSession('alice');
        const before = [...sessionService._sessions.values()][0].expiresAt;
        sessionService.touchSession(tok);
        expect([...sessionService._sessions.values()][0].expiresAt).toBeGreaterThanOrEqual(before);
    });

    it('destroySession removes session', () => {
        const tok = sessionService.createSession('alice');
        sessionService.destroySession(tok);
        expect(sessionService.validateSession(tok)).toBeNull();
    });

    it('validateSession returns null for null/empty token', () => {
        expect(sessionService.validateSession(null)).toBeNull();
        expect(sessionService.validateSession('')).toBeNull();
    });

    it('destroySession is no-op for invalid token', () => {
        expect(() => sessionService.destroySession('bad.token')).not.toThrow();
    });

    it('validateSession returns null for token with non-hex Unicode signature (P0-1 regression)', () => {
        // A token where sig contains a multibyte Unicode character — previously could crash timingSafeEqual
        // After fix (Buffer.from(sig,'hex')), this safely returns null without throwing
        const tok = sessionService.createSession('alice');
        const lastDot = tok.lastIndexOf('.');
        const malformed = tok.slice(0, lastDot + 1) + '你好世界' + tok.slice(lastDot + 5);
        expect(() => sessionService.validateSession(malformed)).not.toThrow();
        expect(sessionService.validateSession(malformed)).toBeNull();
    });

    it('validateSession returns null for token with short hex signature (not 32 bytes after hex decode)', () => {
        const tok = sessionService.createSession('alice');
        const lastDot = tok.lastIndexOf('.');
        // Replace signature with a valid hex string but shorter than 64 chars (not 32 bytes)
        const shortSig = 'deadbeef';
        expect(sessionService.validateSession(tok.slice(0, lastDot + 1) + shortSig)).toBeNull();
    });
});

// ── authController HTTP integration ──────────────────────────────────────────
let app;
let bcryptHash;

beforeEach(async () => {
    jest.resetModules();
    process.env.AUTH_DISABLED = 'false';
    process.env.AUTH_USERNAME = 'admin';
    const bcrypt = require('bcryptjs');
    bcryptHash = await bcrypt.hash('password123', 1);
    process.env.AUTH_PASSWORD_HASH = bcryptHash;
    process.env.AUTH_SESSION_SECRET = 'test-secret';
    app = require('../src/backend/app');
});

afterEach(() => {
    process.env.AUTH_DISABLED = 'true';
    jest.resetModules();
});

describe('POST /api/auth/login', () => {
    it('returns 200 + sets sid cookie on valid credentials', async () => {
        const res = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'password123' });
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.username).toBe('admin');
        expect(res.headers['set-cookie']).toBeDefined();
    });

    it('Set-Cookie sid Max-Age = 28800 seconds (8h × 3600), not milliseconds', async () => {
        process.env.AUTH_SESSION_TTL_HOURS = '8';
        const res = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'password123' });
        const cookie = res.headers['set-cookie']?.[0] || '';
        // maxAge: 8 * 3600 * 1000 ms → Express converts to Max-Age=28800 in Set-Cookie header
        expect(cookie).toMatch(/Max-Age=28800/i);
    });

    it('Set-Cookie sid has HttpOnly and SameSite=Strict', async () => {
        const res = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'password123' });
        const cookie = res.headers['set-cookie']?.[0] || '';
        expect(cookie).toMatch(/HttpOnly/i);
        expect(cookie).toMatch(/SameSite=Strict/i);
    });

    it('returns 401 for wrong password', async () => {
        const res = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'wrong' });
        expect(res.statusCode).toBe(401);
        expect(res.body.error).toBe('invalid_credentials');
    });

    it('returns 401 for wrong username', async () => {
        const res = await request(app).post('/api/auth/login').send({ username: 'hacker', password: 'password123' });
        expect(res.statusCode).toBe(401);
    });

    it('returns 400 when credentials missing', async () => {
        const res = await request(app).post('/api/auth/login').send({});
        expect(res.statusCode).toBe(400);
        expect(res.body.error).toBe('missing_credentials');
    });

    it('returns 503 when AUTH_PASSWORD_HASH not set', async () => {
        process.env.AUTH_PASSWORD_HASH = '';
        jest.resetModules();
        const localApp = require('../src/backend/app');
        const res = await request(localApp).post('/api/auth/login').send({ username: 'admin', password: 'pw' });
        expect(res.statusCode).toBe(503);
        expect(res.body.error).toBe('auth_not_configured');
    });
});

describe('GET /api/auth/me and POST /api/auth/logout', () => {
    let cookie;
    beforeEach(async () => {
        const loginRes = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'password123' });
        cookie = loginRes.headers['set-cookie'];
    });

    it('GET /api/auth/me returns username with valid cookie', async () => {
        const res = await request(app).get('/api/auth/me').set('Cookie', cookie);
        expect(res.statusCode).toBe(200);
        expect(res.body.username).toBe('admin');
    });

    it('GET /api/auth/me returns 401 without cookie', async () => {
        const res = await request(app).get('/api/auth/me');
        expect(res.statusCode).toBe(401);
    });

    it('POST /api/auth/logout succeeds', async () => {
        const res = await request(app).post('/api/auth/logout').set('Cookie', cookie);
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
    });
});

describe('requireAuth — protected routes', () => {
    let cookie;
    beforeEach(async () => {
        const loginRes = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'password123' });
        cookie = loginRes.headers['set-cookie'];
    });

    it('GET /api/read/health is public (no cookie needed)', async () => {
        const res = await request(app).get('/api/read/health');
        expect(res.statusCode).toBe(200);
    });

    it('GET /api/alerts/config returns 401 without cookie', async () => {
        const res = await request(app).get('/api/alerts/config');
        expect(res.statusCode).toBe(401);
        expect(res.body.error).toBe('unauthenticated');
    });

    it('GET /api/alerts/config returns 200 with valid cookie', async () => {
        const res = await request(app).get('/api/alerts/config').set('Cookie', cookie);
        expect(res.statusCode).toBe(200);
    });
});

// ── Bearer token auth (iOS / API clients) ────────────────────────────────────
// Token is no longer in response body (security fix) — extract from Set-Cookie
function extractTokenFromCookies(res) {
    const cookies = res.headers['set-cookie'] || [];
    for (const c of cookies) {
        const m = c.match(/sid=([^;]+)/);
        if (m) return m[1];
    }
    return null;
}

describe('Bearer token auth', () => {
    let token;
    beforeEach(async () => {
        const loginRes = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'password123' });
        token = extractTokenFromCookies(loginRes);
    });

    it('login response does not leak token in body', async () => {
        const res = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'password123' });
        expect(res.body.token).toBeUndefined();
        expect(res.body.success).toBe(true);
    });

    it('GET /api/alerts/config returns 200 with Bearer token', async () => {
        const res = await request(app)
            .get('/api/alerts/config')
            .set('Authorization', `Bearer ${token}`);
        expect(res.statusCode).toBe(200);
    });

    it('GET /api/alerts/config returns 401 with invalid Bearer token', async () => {
        const res = await request(app)
            .get('/api/alerts/config')
            .set('Authorization', 'Bearer invalid.token.here');
        expect(res.statusCode).toBe(401);
    });

    it('GET /api/auth/me returns username with Bearer token', async () => {
        const res = await request(app)
            .get('/api/auth/me')
            .set('Authorization', `Bearer ${token}`);
        expect(res.statusCode).toBe(200);
        expect(res.body.username).toBe('admin');
    });

    it('GET /api/auth/me returns 401 with invalid Bearer token', async () => {
        const res = await request(app)
            .get('/api/auth/me')
            .set('Authorization', 'Bearer bad.token');
        expect(res.statusCode).toBe(401);
    });
});

describe('loginRateLimit — HTTP level', () => {
    it('returns 429 after 5 failed login attempts from same IP', async () => {
        for (let i = 0; i < 5; i++) {
            await request(app).post('/api/auth/login').send({ username: 'admin', password: 'wrong' });
        }
        const res = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'wrong' });
        expect(res.statusCode).toBe(429);
        expect(res.body.error).toBe('too_many_attempts');
        expect(typeof res.body.retryAfter).toBe('number');
    });
});

// ── authController branch coverage ───────────────────────────────────────────
describe('authController — branch coverage', () => {
    it('login with no body (req.body undefined) returns 400 — exercises req.body || {} fallback', async () => {
        // When no body is sent and Content-Type is not application/json,
        // express.json() leaves req.body as undefined → `undefined || {}` branch is taken
        const res = await request(app)
            .post('/api/auth/login')
            .set('Content-Type', 'text/plain')
            .send('');
        expect(res.statusCode).toBe(400);
        expect(res.body.error).toBe('missing_credentials');
    });

    it('login with req.body=undefined directly (unit) — covers req.body || {} falsy branch', async () => {
        // Call authController.login directly with undefined req.body
        jest.resetModules();
        const authController = require('../src/backend/controllers/authController');
        const req = { body: undefined, cookies: {} };
        const res = {
            statusCode: 200,
            status: jest.fn(function (c) { this.statusCode = c; return this; }),
            json: jest.fn(),
        };
        await authController.login(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ success: false, error: 'missing_credentials' });
    });

    it('login falls back to "admin" when AUTH_USERNAME not set', async () => {
        const saved = process.env.AUTH_USERNAME;
        delete process.env.AUTH_USERNAME;
        jest.resetModules();
        const localApp = require('../src/backend/app');
        const res = await request(localApp)
            .post('/api/auth/login')
            .send({ username: 'admin', password: 'password123' });
        expect(res.statusCode).toBe(200); // 'admin' default works
        process.env.AUTH_USERNAME = saved;
    });

    it('login with AUTH_SESSION_TTL_HOURS unset falls back to 8h default', async () => {
        const saved = process.env.AUTH_SESSION_TTL_HOURS;
        delete process.env.AUTH_SESSION_TTL_HOURS;
        jest.resetModules();
        const localApp = require('../src/backend/app');
        const res = await request(localApp)
            .post('/api/auth/login')
            .send({ username: 'admin', password: 'password123' });
        expect(res.statusCode).toBe(200);
        expect(res.headers['set-cookie']).toBeDefined();
        process.env.AUTH_SESSION_TTL_HOURS = saved;
    });

    it('logout without a sid cookie still returns 200', async () => {
        // Tests the !token branch in logout (token is undefined)
        const res = await request(app)
            .post('/api/auth/logout');
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
    });

    it('GET /api/auth/me with expired/invalid cookie returns 401 (!session branch)', async () => {
        // Create a valid token format but with wrong signature to trigger !session
        const res = await request(app)
            .get('/api/auth/me')
            .set('Cookie', 'sid=aaaa.bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
        expect(res.statusCode).toBe(401);
    });
});
