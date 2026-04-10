'use strict';

jest.mock('bcryptjs');
jest.mock('../src/backend/services/sessionService');
jest.mock('../src/backend/config');
jest.mock('../src/backend/utils/apiResponse');

const bcrypt = require('bcryptjs');
const sessionService = require('../src/backend/services/sessionService');
const { getAuthConfig } = require('../src/backend/config');
const { sendOk, sendFail } = require('../src/backend/utils/apiResponse');
const { login, logout, me } = require('../src/backend/controllers/authController');

function mockReq(overrides = {}) {
    return {
        body: {},
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
    res.clearCookie = jest.fn().mockReturnValue(res);
    return res;
}

beforeEach(() => {
    jest.clearAllMocks();
    // Default auth config
    getAuthConfig.mockReturnValue({
        username: 'admin',
        passwordHash: '$2a$10$hashedpassword',
        sessionTtlHours: 8,
    });
    bcrypt.compare.mockResolvedValue(true);
    sessionService.createSession.mockReturnValue('session-token-123');
    sessionService.validateSession.mockReturnValue(null);
    sessionService.destroySession.mockReturnValue(undefined);
    // sendOk/sendFail pass-through
    sendOk.mockImplementation((res, payload) => res.status(200).json({ success: true, ...payload }));
    sendFail.mockImplementation((res, status, error) => res.status(status).json({ success: false, error }));
});

// ─── login ────────────────────────────────────────────────────────────────────

describe('login', () => {
    it('returns 400 missing_credentials when username is missing', async () => {
        const req = mockReq({ body: { password: 'pass' } });
        const res = mockRes();
        await login(req, res);
        expect(sendFail).toHaveBeenCalledWith(res, 400, 'missing_credentials');
    });

    it('returns 400 missing_credentials when password is missing', async () => {
        const req = mockReq({ body: { username: 'admin' } });
        const res = mockRes();
        await login(req, res);
        expect(sendFail).toHaveBeenCalledWith(res, 400, 'missing_credentials');
    });

    it('returns 400 missing_credentials when both username and password are missing', async () => {
        const req = mockReq({ body: {} });
        const res = mockRes();
        await login(req, res);
        expect(sendFail).toHaveBeenCalledWith(res, 400, 'missing_credentials');
    });

    it('returns 503 auth_not_configured when passwordHash is empty', async () => {
        getAuthConfig.mockReturnValue({
            username: 'admin',
            passwordHash: '',
            sessionTtlHours: 8,
        });
        const req = mockReq({ body: { username: 'admin', password: 'pass' } });
        const res = mockRes();
        await login(req, res);
        expect(sendFail).toHaveBeenCalledWith(res, 503, 'auth_not_configured');
    });

    it('returns 401 invalid_credentials when username length differs (timingSafeEqual short-circuit)', async () => {
        const req = mockReq({ body: { username: 'wronglengthuser', password: 'pass' } });
        const res = mockRes();
        await login(req, res);
        expect(sendFail).toHaveBeenCalledWith(res, 401, 'invalid_credentials');
    });

    it('returns 401 invalid_credentials when username matches but bcrypt fails', async () => {
        bcrypt.compare.mockResolvedValue(false);
        const req = mockReq({ body: { username: 'admin', password: 'wrongpass' } });
        const res = mockRes();
        await login(req, res);
        expect(sendFail).toHaveBeenCalledWith(res, 401, 'invalid_credentials');
    });

    it('returns 401 invalid_credentials when bcrypt succeeds but username is wrong same length', async () => {
        bcrypt.compare.mockResolvedValue(true);
        // 'Admin' has same length as 'admin' but different content
        const req = mockReq({ body: { username: 'Admin', password: 'pass' } });
        const res = mockRes();
        await login(req, res);
        expect(sendFail).toHaveBeenCalledWith(res, 401, 'invalid_credentials');
    });

    it('calls createSession, sets cookie, and calls sendOk on success', async () => {
        bcrypt.compare.mockResolvedValue(true);
        const req = mockReq({ body: { username: 'admin', password: 'correctpass' } });
        const res = mockRes();
        await login(req, res);
        expect(sessionService.createSession).toHaveBeenCalledWith('admin');
        expect(res.cookie).toHaveBeenCalledWith('sid', 'session-token-123', expect.any(Object));
        expect(sendOk).toHaveBeenCalledWith(res, { username: 'admin' });
    });

    it('sets cookie with httpOnly=true, secure=true, sameSite=Strict', async () => {
        bcrypt.compare.mockResolvedValue(true);
        const req = mockReq({ body: { username: 'admin', password: 'correctpass' } });
        const res = mockRes();
        await login(req, res);
        const cookieArgs = res.cookie.mock.calls[0];
        expect(cookieArgs[2]).toMatchObject({
            httpOnly: true,
            secure: true,
            sameSite: 'Strict',
        });
    });
});

// ─── logout ───────────────────────────────────────────────────────────────────

describe('logout', () => {
    it('destroys session and clears both cookies when sid cookie is present', () => {
        const req = mockReq({ cookies: { sid: 'session-token-abc' } });
        const res = mockRes();
        logout(req, res);
        expect(sessionService.destroySession).toHaveBeenCalledWith('session-token-abc');
        expect(res.clearCookie).toHaveBeenCalledWith('sid', expect.any(Object));
        expect(res.clearCookie).toHaveBeenCalledWith('_csrfSecret', expect.any(Object));
        expect(sendOk).toHaveBeenCalledWith(res);
    });

    it('works when no cookie is present (token undefined)', () => {
        const req = mockReq({ cookies: {} });
        const res = mockRes();
        logout(req, res);
        expect(sessionService.destroySession).not.toHaveBeenCalled();
        expect(res.clearCookie).toHaveBeenCalledTimes(2);
        expect(sendOk).toHaveBeenCalledWith(res);
    });
});

// ─── me ───────────────────────────────────────────────────────────────────────

describe('me', () => {
    it('returns 401 unauthenticated when no cookie and no Bearer header', () => {
        const req = mockReq({ cookies: {}, headers: {} });
        const res = mockRes();
        me(req, res);
        expect(sendFail).toHaveBeenCalledWith(res, 401, 'unauthenticated');
    });

    it('returns user from valid cookie session', () => {
        sessionService.validateSession.mockReturnValue({ username: 'alice' });
        const req = mockReq({ cookies: { sid: 'valid-cookie-token' }, headers: {} });
        const res = mockRes();
        me(req, res);
        expect(sessionService.validateSession).toHaveBeenCalledWith('valid-cookie-token');
        expect(sendOk).toHaveBeenCalledWith(res, { username: 'alice' });
    });

    it('returns user from valid Bearer token', () => {
        sessionService.validateSession.mockReturnValue({ username: 'bob' });
        const req = mockReq({
            cookies: {},
            headers: { authorization: 'Bearer valid-bearer-token' },
        });
        const res = mockRes();
        me(req, res);
        expect(sessionService.validateSession).toHaveBeenCalledWith('valid-bearer-token');
        expect(sendOk).toHaveBeenCalledWith(res, { username: 'bob' });
    });

    it('returns 401 for invalid/expired token', () => {
        sessionService.validateSession.mockReturnValue(null);
        const req = mockReq({ cookies: { sid: 'expired-token' }, headers: {} });
        const res = mockRes();
        me(req, res);
        expect(sendFail).toHaveBeenCalledWith(res, 401, 'unauthenticated');
    });
});
