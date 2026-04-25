'use strict';

const WINDOW_SIZE = 500;

// key: "METHOD normalized-path", value: array of duration ms (sliding window)
const samples = new Map();

// key: "METHOD normalized-path", value: { '4xx': number, '5xx': number, '429': number }
const errorCounts = new Map();

function record(key, durationMs) {
    if (typeof key !== 'string' || !key) return;
    if (typeof durationMs !== 'number' || !Number.isFinite(durationMs) || durationMs < 0) return;
    if (!samples.has(key)) samples.set(key, []);
    const arr = samples.get(key);
    arr.push(durationMs);
    // Cap at WINDOW_SIZE by dropping oldest — splice is O(k) but called rarely
    if (arr.length > WINDOW_SIZE) {
        arr.splice(0, arr.length - WINDOW_SIZE);
    }
}

function recordError(key, statusCode) {
    if (typeof key !== 'string' || !key) return;
    if (!Number.isInteger(statusCode) || statusCode < 400 || statusCode > 599) return;
    if (!errorCounts.has(key)) errorCounts.set(key, { '4xx': 0, '5xx': 0, '429': 0 });
    const counts = errorCounts.get(key);
    if (statusCode === 429) {
        // 429 Too Many Requests — rate-limit bucket, mutually exclusive with generic 4xx
        counts['429'] += 1;
    } else if (statusCode >= 400 && statusCode <= 499) {
        counts['4xx'] += 1;
    } else if (statusCode >= 500 && statusCode <= 599) {
        counts['5xx'] += 1;
    }
}

function percentile(sorted, p) {
    if (sorted.length === 0) return 0;
    // Nearest-rank method: floor(N * p), clamped
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * p)));
    return sorted[idx];
}

function getStats() {
    const result = {};
    for (const [key, arr] of samples) {
        if (arr.length === 0) continue;
        const sorted = [...arr].sort((a, b) => a - b);
        const sum = arr.reduce((s, x) => s + x, 0);
        const ec = errorCounts.get(key) || { '4xx': 0, '5xx': 0, '429': 0 };
        result[key] = {
            count: sorted.length,
            p50: percentile(sorted, 0.50),
            p95: percentile(sorted, 0.95),
            p99: percentile(sorted, 0.99),
            min: sorted[0],
            max: sorted[sorted.length - 1],
            mean: Math.round(sum / arr.length),
            errorCount: { '4xx': ec['4xx'], '5xx': ec['5xx'], '429': ec['429'] },
        };
    }
    return result;
}

function reset() {
    samples.clear();
    errorCounts.clear();
}

module.exports = { record, recordError, getStats, reset, WINDOW_SIZE };
