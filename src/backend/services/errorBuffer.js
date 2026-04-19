'use strict';

const CAP = 50;

// Ring buffer — newest entries at the end of the array
const buffer = [];

const REQUIRED_FIELDS = ['timestamp', 'requestId', 'method', 'path', 'statusCode', 'error', 'durationMs'];

function push(entry) {
    if (!entry || typeof entry !== 'object') return;
    // Validate required fields are present
    for (const field of REQUIRED_FIELDS) {
        if (!(field in entry)) return;
    }
    // Only accept 5xx errors
    if (!Number.isInteger(entry.statusCode) || entry.statusCode < 500 || entry.statusCode > 599) return;
    // Defensive: error must be string to avoid leaking [object Object] or serialized exceptions
    if (typeof entry.error !== 'string') return;
    // Defensive: strip query string from path
    const safePath = typeof entry.path === 'string' ? entry.path.split('?')[0] : entry.path;
    const record = {
        timestamp: entry.timestamp,
        requestId: entry.requestId,
        method: entry.method,
        path: safePath,
        statusCode: entry.statusCode,
        error: entry.error,
        durationMs: entry.durationMs,
    };
    buffer.push(record);
    // Drop oldest if over capacity
    if (buffer.length > CAP) {
        buffer.splice(0, buffer.length - CAP);
    }
}

function getRecent(limit) {
    const n = (typeof limit === 'number' && Number.isFinite(limit) && limit >= 1)
        ? Math.min(Math.floor(limit), CAP)
        : 20;
    // Return newest-first
    return buffer.slice(-n).reverse();
}

function reset() {
    buffer.splice(0, buffer.length);
}

module.exports = { push, getRecent, reset, CAP };
