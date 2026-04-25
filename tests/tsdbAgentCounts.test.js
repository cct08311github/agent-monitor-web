'use strict';

// Tests for tsdbService.getLatestAgentCounts()
// Mirror the pattern from tsdbService.test.js exactly.

const path = require('path');
const os = require('os');
const fs = require('fs');

const mockTmpDir = path.join(os.tmpdir(), `agent-monitor-tsdb-counts-test-${process.pid}`);
const mockTmpDbPath = path.join(mockTmpDir, 'tsdb.sqlite');

if (!fs.existsSync(mockTmpDir)) {
    fs.mkdirSync(mockTmpDir, { recursive: true });
}

jest.mock('better-sqlite3', () => {
    const Real = jest.requireActual('better-sqlite3');
    return jest.fn().mockImplementation((dbPath, opts) => {
        return new Real(mockTmpDbPath, opts || {});
    });
});

jest.spyOn(fs, 'mkdirSync').mockImplementation((p, opts) => {
    if (p && p.includes('/data')) return;
    return fs.mkdirSync.wrappedMethod ? fs.mkdirSync.wrappedMethod(p, opts) : undefined;
});
const _realExistsSync = fs.existsSync.bind(fs);
jest.spyOn(fs, 'existsSync').mockImplementation((p) => {
    if (p && p.includes('/data') && !p.includes('tsdb')) return true;
    return _realExistsSync(p);
});

const tsdbService = require('../src/backend/services/tsdbService');

afterAll(() => {
    try { fs.rmSync(mockTmpDir, { recursive: true, force: true }); } catch (_) {}
    jest.restoreAllMocks();
});

describe('tsdbService.getLatestAgentCounts', () => {
    it('is exported from the module', () => {
        expect(typeof tsdbService.getLatestAgentCounts).toBe('function');
    });

    it('returns null or a valid shape on a fresh/empty DB', () => {
        // After mock redirects to temp DB, it may have rows from prior test ordering.
        // Contract: null (no rows) or { total: number, active: number }
        const result = tsdbService.getLatestAgentCounts();
        if (result !== null) {
            expect(result).toHaveProperty('total');
            expect(result).toHaveProperty('active');
        } else {
            expect(result).toBeNull();
        }
    });

    it('returns { total, active } with correct counts after a snapshot is saved', () => {
        const agents = [
            { id: 'a1', status: 'active_executing', cost: 0.01, tokens: { input: 10, output: 5 } },
            { id: 'a2', status: 'active_executing', cost: 0.02, tokens: { input: 20, output: 10 } },
            { id: 'a3', status: 'dormant', cost: 0, tokens: { input: 0, output: 0 } },
        ];
        tsdbService.saveSnapshot({ cpu: 10, memory: 20, disk: 5 }, agents);

        const result = tsdbService.getLatestAgentCounts();

        expect(result).not.toBeNull();
        expect(typeof result.total).toBe('number');
        expect(typeof result.active).toBe('number');
        expect(result.total).toBe(3);
        expect(result.active).toBe(2); // only 'active_executing' agents
    });

    it('returns the most recent snapshot only (DESC LIMIT 1) when multiple rows exist', () => {
        // Older: 1 total, 0 active
        tsdbService.saveSnapshot({ cpu: 1, memory: 1, disk: 1 }, [
            { id: 'old', status: 'dormant', cost: 0 },
        ]);

        // Newer: 4 total, 4 active
        const activeAgents = [
            { id: 'b1', status: 'active_executing', cost: 0 },
            { id: 'b2', status: 'active_executing', cost: 0 },
            { id: 'b3', status: 'active_executing', cost: 0 },
            { id: 'b4', status: 'active_executing', cost: 0 },
        ];
        tsdbService.saveSnapshot({ cpu: 5, memory: 5, disk: 5 }, activeAgents);

        const result = tsdbService.getLatestAgentCounts();

        expect(result).not.toBeNull();
        expect(result.total).toBe(4);
        expect(result.active).toBe(4);
    });

    it('returns { total: 0, active: 0 } when an empty agents array is saved', () => {
        tsdbService.saveSnapshot({ cpu: 0, memory: 0, disk: 0 }, []);

        const result = tsdbService.getLatestAgentCounts();

        expect(result).not.toBeNull();
        expect(result.total).toBe(0);
        expect(result.active).toBe(0);
    });
});
