'use strict';

const fs = require('fs');
const path = require('path');
const { getOpenClawConfig } = require('../config');
const { ok } = require('../utils/apiResponse');

const VALID_ID = /^[a-zA-Z0-9_-]+$/;
const MAX_SESSION_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

function sanitizeId(value) {
    const str = String(value || '');
    if (!str || !VALID_ID.test(str)) return '';
    return str;
}

function getSessionsDir(agentId) {
    return path.join(getOpenClawConfig().agentsRoot, agentId, 'sessions');
}

function getSessionFilePath(agentId, sessionId) {
    return path.join(getSessionsDir(agentId), `${sessionId}.jsonl`);
}

function readSessionContent(agentIdInput, sessionIdInput) {
    const agentId = sanitizeId(agentIdInput);
    const sessionId = sanitizeId(sessionIdInput);
    if (!agentId || !sessionId) {
        return { statusCode: 400, body: { success: false, error: 'invalid_params' } };
    }

    const filePath = getSessionFilePath(agentId, sessionId);
    if (!fs.existsSync(filePath)) {
        return { statusCode: 404, body: { success: false, error: 'not_found' } };
    }

    // Symlink guard: ensure resolved path stays within expected sessions dir
    const sessionsDir = getSessionsDir(agentId);
    try {
        const realPath = fs.realpathSync(filePath);
        if (!realPath.startsWith(sessionsDir + path.sep) && realPath !== sessionsDir) {
            return { statusCode: 403, body: { success: false, error: 'forbidden' } };
        }
    } catch (_) {
        return { statusCode: 404, body: { success: false, error: 'not_found' } };
    }

    // File size guard: prevent OOM from very large session files
    const stat = fs.statSync(filePath);
    if (stat.size > MAX_SESSION_FILE_BYTES) {
        return { statusCode: 413, body: { success: false, error: 'session_too_large' } };
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const messages = [];
    for (const line of content.split('\n')) {
        if (!line.trim()) continue;
        try {
            const obj = JSON.parse(line);
            if (obj.type !== 'message' || !obj.message) continue;
            const { role, content: msgContent } = obj.message;
            const blocks = Array.isArray(msgContent) ? msgContent : [{ type: 'text', text: String(msgContent || '') }];
            const text = blocks.filter((b) => b.type === 'text').map((b) => b.text || '').join('');
            const toolUses = blocks.filter((b) => b.type === 'tool_use').map((b) => b.name || '').filter(Boolean);
            messages.push({ role, text, toolUses, ts: obj.timestamp || null });
        } catch (_) { /* malformed JSONL line — skip */ }
    }

    return { statusCode: 200, body: ok({ sessionId, messages }) };
}

function readSessions(agentIdInput) {
    const agentId = sanitizeId(agentIdInput);
    if (!agentId) {
        return { statusCode: 400, body: { success: false, error: 'invalid_agent_id' } };
    }

    const sessionsDir = getSessionsDir(agentId);
    if (!fs.existsSync(sessionsDir)) {
        return { statusCode: 200, body: ok({ sessions: [] }) };
    }

    const files = fs.readdirSync(sessionsDir)
        .filter((f) => f.endsWith('.jsonl'))
        .sort()
        .reverse()
        .slice(0, 20);

    const sessions = files.map((f) => {
        const filePath = path.join(sessionsDir, f);
        let messageCount = 0;
        let lastTs = null;
        try {
            const fstat = fs.statSync(filePath);
            if (fstat.size > MAX_SESSION_FILE_BYTES) {
                return { id: f.replace('.jsonl', ''), messageCount: -1, lastTs: null };
            }
            const content = fs.readFileSync(filePath, 'utf8');
            const lines = content.split('\n').filter((l) => l.trim());
            messageCount = lines.length;
            for (let i = lines.length - 1; i >= 0; i--) {
                try {
                    const obj = JSON.parse(lines[i]);
                    if (obj.ts || obj.timestamp || obj.created_at) {
                        lastTs = obj.ts || obj.timestamp || obj.created_at;
                        break;
                    }
                } catch (_) { /* malformed line — skip */ }
            }
        } catch (_) { /* file read fail — return defaults */ }
        return { id: f.replace('.jsonl', ''), messageCount, lastTs };
    });

    return { statusCode: 200, body: ok({ sessions }) };
}

module.exports = {
    readSessionContent,
    readSessions,
    sanitizeId,
};
