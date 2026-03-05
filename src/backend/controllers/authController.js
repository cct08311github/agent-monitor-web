// src/backend/controllers/authController.js
'use strict';
const bcrypt = require('bcryptjs');
const sessionService = require('../services/sessionService');

const COOKIE_NAME = 'sid';

function cookieOptions(ttlHours) {
    return {
        httpOnly: true,
        secure: true,
        sameSite: 'Strict',
        path: '/',
        maxAge: (ttlHours || 8) * 3600,
    };
}

async function login(req, res) {
    const { username, password } = req.body || {};
    if (!username || !password) {
        return res.status(400).json({ success: false, error: 'missing_credentials' });
    }

    const expectedUser = process.env.AUTH_USERNAME || 'admin';
    const expectedHash = process.env.AUTH_PASSWORD_HASH || '';

    if (!expectedHash) {
        return res.status(503).json({ success: false, error: 'auth_not_configured' });
    }

    if (username !== expectedUser) {
        return res.status(401).json({ success: false, error: 'invalid_credentials' });
    }

    const valid = await bcrypt.compare(password, expectedHash);
    if (!valid) {
        return res.status(401).json({ success: false, error: 'invalid_credentials' });
    }

    const token = sessionService.createSession(username);
    const ttl = parseFloat(process.env.AUTH_SESSION_TTL_HOURS) || 8;
    res.cookie(COOKIE_NAME, token, cookieOptions(ttl));
    return res.json({ success: true, username });
}

function logout(req, res) {
    const token = req.cookies?.[COOKIE_NAME];
    if (token) sessionService.destroySession(token);
    res.clearCookie(COOKIE_NAME, { path: '/' });
    return res.json({ success: true });
}

function me(req, res) {
    const token = req.cookies?.[COOKIE_NAME];
    if (!token) return res.status(401).json({ success: false, error: 'unauthenticated' });
    const session = sessionService.validateSession(token);
    if (!session) return res.status(401).json({ success: false, error: 'unauthenticated' });
    return res.json({ success: true, username: session.username });
}

module.exports = { login, logout, me };
