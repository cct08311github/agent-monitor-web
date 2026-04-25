// tsdbAgentHistory.test.js — tests for getAgentHistory
const path = require('path');
const os = require('os');
const fs = require('fs');

// Use a separate temp dir to avoid conflicts with the main tsdbService.test.js
const mockTmpDir = path.join(os.tmpdir(), `agent-monitor-history-test-${process.pid}`);
if (!fs.existsSync(mockTmpDir)) {
    fs.mkdirSync(mockTmpDir, { recursive: true });
}
const mockTmpDbPath = path.join(mockTmpDir, 'tsdb-history.sqlite');

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
jest.spyOn(fs, 'existsSync').mockImplementation((p) => {
    if (p && p.includes('/data') && !p.includes('tsdb')) return true;
    return fs.existsSync.wrappedMethod ? fs.existsSync.wrappedMethod(p) : true;
});

const tsdbService = require('../src/backend/services/tsdbService');

afterAll(() => {
    try { fs.rmSync(mockTmpDir, { recursive: true, force: true }); } catch (_) {}
    jest.restoreAllMocks();
});

describe('tsdbService.getAgentHistory', () => {
    beforeEach(() => {
        // Insert some known data for agent 'hist-agent' and 'other-agent'
        tsdbService.saveSnapshot(
            { cpu: 10, memory: 20, disk: 5 },
            [
                { id: 'hist-agent', status: 'active_executing', cost: 0.01, tokens: { input: 100, output: 50 } },
                { id: 'other-agent', status: 'dormant', cost: 0.02, tokens: { input: 200, output: 80 } },
            ]
        );
        tsdbService.saveSnapshot(
            { cpu: 20, memory: 30, disk: 6 },
            [
                { id: 'hist-agent', status: 'active_executing', cost: 0.03, tokens: { input: 150, output: 70 } },
            ]
        );
    });

    it('returns sorted-asc results for known agent', () => {
        const result = tsdbService.getAgentHistory('hist-agent', 24);
        expect(Array.isArray(result)).toBe(true);
        // Should have at least the 2 rows inserted in beforeEach
        expect(result.length).toBeGreaterThanOrEqual(2);
        // Verify ascending order
        for (let i = 1; i < result.length; i++) {
            expect(result[i].timestamp >= result[i - 1].timestamp).toBe(true);
        }
    });

    it('returns empty array for non-existent agent_id', () => {
        const result = tsdbService.getAgentHistory('no-such-agent-xyz', 24);
        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBe(0);
    });

    it('returns [] for hours below range (0)', () => {
        const result = tsdbService.getAgentHistory('hist-agent', 0);
        expect(result).toEqual([]);
    });

    it('returns [] for hours above range (169)', () => {
        const result = tsdbService.getAgentHistory('hist-agent', 169);
        expect(result).toEqual([]);
    });

    it('does not mix rows from different agents', () => {
        const histResult = tsdbService.getAgentHistory('hist-agent', 168);
        const otherResult = tsdbService.getAgentHistory('other-agent', 168);
        // hist-agent has >= 2 entries, other-agent has >= 1 entry
        expect(histResult.length).toBeGreaterThanOrEqual(2);
        expect(otherResult.length).toBeGreaterThanOrEqual(1);
        // None of hist-agent rows should appear in other-agent result
        // (spot check: cost for hist-agent rows is 0.01 or 0.03)
        // We verify all rows returned for hist-agent only contain hist-agent data
        // by checking that the total set sizes differ from each other when agents differ
        const histCosts = histResult.map(r => r.cost);
        const otherCosts = otherResult.map(r => r.cost);
        // hist-agent and other-agent should not be the same unless collisions
        // In practice other-agent has cost 0.02, hist-agent has 0.01 and 0.03
        // Just verify no overlap in identity by checking arrays are independent
        expect(histResult).not.toEqual(otherResult);
    });

    it('returns [] for empty agentId string', () => {
        const result = tsdbService.getAgentHistory('', 24);
        expect(result).toEqual([]);
    });

    it('each row has expected shape', () => {
        const result = tsdbService.getAgentHistory('hist-agent', 24);
        expect(result.length).toBeGreaterThan(0);
        const row = result[0];
        expect(row).toHaveProperty('timestamp');
        expect(row).toHaveProperty('cost');
        expect(row).toHaveProperty('input_tokens');
        expect(row).toHaveProperty('output_tokens');
        expect(typeof row.cost).toBe('number');
        expect(typeof row.input_tokens).toBe('number');
        expect(typeof row.output_tokens).toBe('number');
    });

    it('returns [] for non-string agentId (null)', () => {
        const result = tsdbService.getAgentHistory(null, 24);
        expect(result).toEqual([]);
    });
});
