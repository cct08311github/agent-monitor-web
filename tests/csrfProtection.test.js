'use strict';

const {
    csrfTokenGenerator,
    csrfVerifier,
    CSRF_SECRET_COOKIE,
    CSRF_HEADER,
} = require('../src/backend/middlewares/csrfProtection');

function mockReq(overrides = {}) {
    return {
        method: 'GET',
        cookies: {},
        headers: {},
        ...overrides,
    };
}

function mockRes() {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    res.cookie = jest.fn().mockReturnValue(res);
    return res;
}

// ─── csrfTokenGenerator ───────────────────────────────────────────────────────

describe('csrfTokenGenerator', () => {
    it('sets cookie and req.csrfToken when no existing cookie', () => {
        const req = mockReq({ cookies: {} });
        const res = mockRes();
        const next = jest.fn();
        csrfTokenGenerator(req, res, next);
        expect(res.cookie).toHaveBeenCalledWith(
            CSRF_SECRET_COOKIE,
            expect.any(String),
            expect.any(Object)
        );
        expect(req.csrfToken).toBeDefined();
        expect(typeof req.csrfToken).toBe('string');
        expect(req.csrfToken.length).toBeGreaterThan(0);
    });

    it('reuses existing cookie value when present', () => {
        const existingToken = 'existing-csrf-token-abc123';
        const req = mockReq({ cookies: { [CSRF_SECRET_COOKIE]: existingToken } });
        const res = mockRes();
        const next = jest.fn();
        csrfTokenGenerator(req, res, next);
        expect(req.csrfToken).toBe(existingToken);
        expect(res.cookie).toHaveBeenCalledWith(
            CSRF_SECRET_COOKIE,
            existingToken,
            expect.any(Object)
        );
    });

    it('sets cookie with httpOnly=false, secure=true, sameSite=strict', () => {
        const req = mockReq({ cookies: {} });
        const res = mockRes();
        const next = jest.fn();
        csrfTokenGenerator(req, res, next);
        const cookieOptions = res.cookie.mock.calls[0][2];
        expect(cookieOptions.httpOnly).toBe(false);
        expect(cookieOptions.secure).toBe(true);
        expect(cookieOptions.sameSite).toBe('strict');
    });

    it('calls next()', () => {
        const req = mockReq({ cookies: {} });
        const res = mockRes();
        const next = jest.fn();
        csrfTokenGenerator(req, res, next);
        expect(next).toHaveBeenCalled();
    });
});

// ─── csrfVerifier ─────────────────────────────────────────────────────────────

describe('csrfVerifier', () => {
    let originalAuthDisabled;

    beforeEach(() => {
        originalAuthDisabled = process.env.AUTH_DISABLED;
        delete process.env.AUTH_DISABLED;
    });

    afterEach(() => {
        if (originalAuthDisabled === undefined) {
            delete process.env.AUTH_DISABLED;
        } else {
            process.env.AUTH_DISABLED = originalAuthDisabled;
        }
    });

    it('skips verification for GET method and calls next()', () => {
        const req = mockReq({ method: 'GET', cookies: {} });
        const res = mockRes();
        const next = jest.fn();
        csrfVerifier(req, res, next);
        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
    });

    it('skips verification for HEAD method and calls next()', () => {
        const req = mockReq({ method: 'HEAD', cookies: {} });
        const res = mockRes();
        const next = jest.fn();
        csrfVerifier(req, res, next);
        expect(next).toHaveBeenCalled();
    });

    it('skips verification for OPTIONS method and calls next()', () => {
        const req = mockReq({ method: 'OPTIONS', cookies: {} });
        const res = mockRes();
        const next = jest.fn();
        csrfVerifier(req, res, next);
        expect(next).toHaveBeenCalled();
    });

    it('skips verification when AUTH_DISABLED=true for POST', () => {
        process.env.AUTH_DISABLED = 'true';
        const req = mockReq({ method: 'POST', cookies: {} });
        const res = mockRes();
        const next = jest.fn();
        csrfVerifier(req, res, next);
        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
    });

    it('returns 403 csrf_token_missing when no cookie present', () => {
        const req = mockReq({ method: 'POST', cookies: {} });
        const res = mockRes();
        const next = jest.fn();
        csrfVerifier(req, res, next);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'csrf_token_missing' }));
        expect(next).not.toHaveBeenCalled();
    });

    it('returns 403 csrf_token_missing when no header token provided', () => {
        const token = 'valid-csrf-token';
        const req = mockReq({
            method: 'POST',
            cookies: { [CSRF_SECRET_COOKIE]: token },
            headers: {},
        });
        const res = mockRes();
        const next = jest.fn();
        csrfVerifier(req, res, next);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'csrf_token_missing' }));
        expect(next).not.toHaveBeenCalled();
    });

    it('returns 403 csrf_token_invalid when tokens have same length but differ', () => {
        const cookieToken = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
        const headerToken = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
        expect(cookieToken.length).toBe(headerToken.length);
        const req = mockReq({
            method: 'POST',
            cookies: { [CSRF_SECRET_COOKIE]: cookieToken },
            headers: { [CSRF_HEADER]: headerToken },
        });
        const res = mockRes();
        const next = jest.fn();
        csrfVerifier(req, res, next);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'csrf_token_invalid' }));
        expect(next).not.toHaveBeenCalled();
    });

    it('returns 403 csrf_token_invalid when tokens have different lengths (timingSafeEqual throws)', () => {
        const req = mockReq({
            method: 'POST',
            cookies: { [CSRF_SECRET_COOKIE]: 'short' },
            headers: { [CSRF_HEADER]: 'much-longer-token-value-here' },
        });
        const res = mockRes();
        const next = jest.fn();
        csrfVerifier(req, res, next);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'csrf_token_invalid' }));
        expect(next).not.toHaveBeenCalled();
    });

    it('calls next() when cookie and header tokens match', () => {
        const token = 'matching-csrf-token-12345';
        const req = mockReq({
            method: 'POST',
            cookies: { [CSRF_SECRET_COOKIE]: token },
            headers: { [CSRF_HEADER]: token },
        });
        const res = mockRes();
        const next = jest.fn();
        csrfVerifier(req, res, next);
        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
    });

    it('verifies PUT method correctly', () => {
        const token = 'csrf-token-put';
        const req = mockReq({
            method: 'PUT',
            cookies: { [CSRF_SECRET_COOKIE]: token },
            headers: { [CSRF_HEADER]: token },
        });
        const res = mockRes();
        const next = jest.fn();
        csrfVerifier(req, res, next);
        expect(next).toHaveBeenCalled();
    });

    it('verifies PATCH method correctly', () => {
        const token = 'csrf-token-patch';
        const req = mockReq({
            method: 'PATCH',
            cookies: { [CSRF_SECRET_COOKIE]: token },
            headers: { [CSRF_HEADER]: token },
        });
        const res = mockRes();
        const next = jest.fn();
        csrfVerifier(req, res, next);
        expect(next).toHaveBeenCalled();
    });

    it('verifies DELETE method correctly', () => {
        const token = 'csrf-token-delete';
        const req = mockReq({
            method: 'DELETE',
            cookies: { [CSRF_SECRET_COOKIE]: token },
            headers: { [CSRF_HEADER]: token },
        });
        const res = mockRes();
        const next = jest.fn();
        csrfVerifier(req, res, next);
        expect(next).toHaveBeenCalled();
    });
});
