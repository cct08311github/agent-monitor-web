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

    it('allows *.local mDNS hostname', () => {
        const req = mockReq({ headers: { host: 'macbook.local:3000' } });
        auth.localhostOnlyControl(req, mockRes(), next);
        expect(next).toHaveBeenCalled();
    });

    it('allows known mac hostnames', () => {
        const req = mockReq({ headers: { host: 'shenghuoguanjiademac-mini.local' } });
        auth.localhostOnlyControl(req, mockRes(), next);
        expect(next).toHaveBeenCalled();
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

describe('requireBearerToken', () => {
    it('rejects missing Authorization header', () => {
        const req = mockReq({ headers: { host: 'localhost' } });
        const res = mockRes();
        auth.requireBearerToken(req, res, next);
        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    it('rejects non-Bearer auth scheme', () => {
        const req = mockReq({ headers: { host: 'localhost', authorization: 'Basic abc123' } });
        const res = mockRes();
        auth.requireBearerToken(req, res, next);
        expect(res.status).toHaveBeenCalledWith(401);
    });

    it('accepts correct password hash (810778)', () => {
        // CONTROL_TOKEN env not set → uses password hash check
        const req = mockReq({ headers: { host: 'localhost', authorization: 'Bearer 810778' } });
        auth.requireBearerToken(req, mockRes(), next);
        expect(next).toHaveBeenCalled();
    });

    it('rejects wrong password', () => {
        const req = mockReq({ headers: { host: 'localhost', authorization: 'Bearer wrongpass' } });
        const res = mockRes();
        auth.requireBearerToken(req, res, next);
        expect(res.status).toHaveBeenCalledWith(401);
    });

    it('sets req._actorToken on success', () => {
        const req = mockReq({ headers: { host: 'localhost', authorization: 'Bearer 810778' } });
        auth.requireBearerToken(req, mockRes(), next);
        expect(req._actorToken).toBe('810778');
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
});
