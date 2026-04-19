'use strict';

const WINDOW_SIZE = 500;

// key: "METHOD normalized-path", value: array of duration ms (sliding window)
const samples = new Map();

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
        result[key] = {
            count: sorted.length,
            p50: percentile(sorted, 0.50),
            p95: percentile(sorted, 0.95),
            p99: percentile(sorted, 0.99),
            min: sorted[0],
            max: sorted[sorted.length - 1],
            mean: Math.round(sum / arr.length),
        };
    }
    return result;
}

function reset() { samples.clear(); }

module.exports = { record, getStats, reset, WINDOW_SIZE };
