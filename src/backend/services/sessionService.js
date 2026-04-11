// src/backend/services/sessionService.js
'use strict';
const crypto = require('crypto');
const { getAuthConfig } = require('../config');

const sessions = new Map(); // sessionId → { username, expiresAt, lastAccessAt }
const MAX_SESSIONS = 1000;
const MAX_SESSIONS_PER_USER = 5;

function getSecret() {
    return getAuthConfig().sessionSecret;
}

function getTtlMs() {
    return getAuthConfig().sessionTtlHours * 60 * 60 * 1000;
}

function sign(id) {
    return id + '.' + crypto.createHmac('sha256', getSecret()).update(id).digest('hex');
}

function unsign(token) {
    if (!token || !token.includes('.')) return null;
    const lastDot = token.lastIndexOf('.');
    const id = token.slice(0, lastDot);
    const sig = token.slice(lastDot + 1);
    const expected = crypto.createHmac('sha256', getSecret()).update(id).digest('hex');
    const sigBuf = Buffer.from(sig, 'hex');
    const expBuf = Buffer.from(expected, 'hex');
    if (sig.length !== 64 || sigBuf.length !== 32 || expBuf.length !== 32) return null;
    if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;
    return id;
}

function createSession(username) {
    // Global cap — evict oldest session if at ceiling
    if (sessions.size >= MAX_SESSIONS) {
        let gOldestId = null, gOldestTs = Infinity;
        for (const [id, s] of sessions) {
            if (s.createdAt < gOldestTs) { gOldestTs = s.createdAt; gOldestId = id; }
        }
        if (gOldestId) sessions.delete(gOldestId);
    }

    const id = crypto.randomBytes(32).toString('hex');
    const now = Date.now();
    sessions.set(id, { username, createdAt: now, lastAccessAt: now, expiresAt: now + getTtlMs() });
    return sign(id);
}

const MAX_ABSOLUTE_SESSION_MS = 24 * 60 * 60 * 1000; // 24 hours

function validateSession(token) {
    const id = unsign(token);
    if (!id) return null;
    const session = sessions.get(id);
    if (!session) return null;
    const now = Date.now();
    if (now > session.expiresAt || now > session.createdAt + MAX_ABSOLUTE_SESSION_MS) {
        sessions.delete(id);
        return null;
    }
    return session;
}

function touchSession(token) {
    const id = unsign(token);
    if (!id) return;
    const session = sessions.get(id);
    if (!session) return;
    const now = Date.now();
    session.lastAccessAt = now;
    session.expiresAt = now + getTtlMs();
}

function destroySession(token) {
    const id = unsign(token);
    if (id) sessions.delete(id);
}

// GC: clear expired sessions every 5 minutes
/* istanbul ignore next */
if (process.env.NODE_ENV !== 'test') {
    setInterval(() => {
        const now = Date.now();
        for (const [id, s] of sessions) {
            if (now > s.expiresAt || now > s.createdAt + MAX_ABSOLUTE_SESSION_MS) sessions.delete(id);
        }
    }, 5 * 60 * 1000).unref();
}

function destroySessionsForUser(username) {
    for (const [id, s] of sessions) {
        if (s.username === username) sessions.delete(id);
    }
}

function _clearSessions() { sessions.clear(); }

module.exports = { createSession, validateSession, touchSession, destroySession, destroySessionsForUser, _sessions: sessions, _clearSessions };
