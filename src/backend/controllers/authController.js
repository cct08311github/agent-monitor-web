// src/backend/controllers/authController.js
'use strict';
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const sessionService = require('../services/sessionService');
const { getAuthConfig } = require('../config');
const { sendOk, sendFail } = require('../utils/apiResponse');

const COOKIE_NAME = 'sid';

function cookieOptions(ttlHours) {
    return {
        httpOnly: true,
        secure: true,
        sameSite: 'Strict',
        path: '/',
        maxAge: ttlHours * 3600 * 1000,
    };
}

async function login(req, res) {
    const { username, password } = req.body || {};
    if (!username || !password) {
        return sendFail(res, 400, 'missing_credentials');
    }

    const authConfig = getAuthConfig();
    const expectedUser = authConfig.username;
    const expectedHash = authConfig.passwordHash;

    if (!expectedHash) {
        return sendFail(res, 503, 'auth_not_configured');
    }

    // Compare username in constant time and always run bcrypt to prevent
    // timing oracles (wrong username vs wrong password must take equal time).
    const aBuf = Buffer.from(username);
    const bBuf = Buffer.from(expectedUser);
    const usernameOk = aBuf.length === bBuf.length && crypto.timingSafeEqual(aBuf, bBuf);

    const valid = await bcrypt.compare(password, expectedHash);
    if (!usernameOk || !valid) {
        return sendFail(res, 401, 'invalid_credentials');
    }

    const token = sessionService.createSession(username);
    res.cookie(COOKIE_NAME, token, cookieOptions(authConfig.sessionTtlHours));
    return sendOk(res, { username });
}

function logout(req, res) {
    const token = req.cookies?.[COOKIE_NAME];
    if (token) sessionService.destroySession(token);
    res.clearCookie(COOKIE_NAME, { path: '/', httpOnly: true, secure: true, sameSite: 'Strict' });
    res.clearCookie('_csrfSecret', { path: '/', httpOnly: false, secure: true, sameSite: 'Strict' });
    return sendOk(res);
}

function me(req, res) {
    // Support both cookie and Bearer token for /me endpoint
    let token = req.cookies?.[COOKIE_NAME];
    if (!token) {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.slice(7);
        }
    }
    if (!token) return sendFail(res, 401, 'unauthenticated');
    const session = sessionService.validateSession(token);
    if (!session) return sendFail(res, 401, 'unauthenticated');
    return sendOk(res, { username: session.username });
}

module.exports = { login, logout, me };
