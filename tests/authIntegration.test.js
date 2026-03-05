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
        sessionService._sessions.clear();
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
