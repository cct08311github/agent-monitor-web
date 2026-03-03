// tsdbService tests - use a real temp directory to avoid mocking path module
const path = require('path');
const os = require('os');
const fs = require('fs');

// Create a temp dir BEFORE requiring tsdbService
const mockTmpDir = path.join(os.tmpdir(), `agent-monitor-tsdb-test-${process.pid}`);

// Override the data directory by setting an env var that the module uses,
// or by creating the expected directory structure.
// tsdbService hardcodes: path.join(__dirname, '../../../data')
// which resolves to: src/backend/services/../../../data = data/
// We monkey-patch the Database constructor BEFORE requiring the module.

// Approach: Intercept better-sqlite3 to use our temp path
const RealDatabase = require('better-sqlite3');

// Create temp dir
if (!fs.existsSync(mockTmpDir)) {
    fs.mkdirSync(mockTmpDir, { recursive: true });
}

const mockTmpDbPath = path.join(mockTmpDir, 'tsdb.sqlite');

jest.mock('better-sqlite3', () => {
    const Real = jest.requireActual('better-sqlite3');
    return jest.fn().mockImplementation((dbPath, opts) => {
        // Redirect to our temp path
        return new Real(mockTmpDbPath, opts || {});
    });
});

// Also mock fs.mkdirSync for the data dir creation to avoid real dir creation
jest.spyOn(fs, 'mkdirSync').mockImplementation((p, opts) => {
    if (p && p.includes('/data')) return; // suppress data dir creation
    return fs.mkdirSync.wrappedMethod ? fs.mkdirSync.wrappedMethod(p, opts) : undefined;
});
jest.spyOn(fs, 'existsSync').mockImplementation((p) => {
    if (p && p.includes('/data') && !p.includes('tsdb')) return true; // pretend data dir exists
    return fs.existsSync.wrappedMethod ? fs.existsSync.wrappedMethod(p) : true;
});

const tsdbService = require('../src/backend/services/tsdbService');

afterAll(() => {
    try { fs.rmSync(mockTmpDir, { recursive: true, force: true }); } catch (_) {}
    jest.restoreAllMocks();
});

describe('tsdbService', () => {
    describe('saveSnapshot', () => {
        it('saves system snapshot with agents', () => {
            const agents = [
                { id: 'main', status: 'active_executing', cost: 0.01, tokens: { input: 100, output: 50 } },
                { id: 'work', status: 'dormant', cost: 0 },
            ];
            expect(() => tsdbService.saveSnapshot({ cpu: 50, memory: 60, disk: 30 }, agents)).not.toThrow();
        });

        it('handles agents without tokens', () => {
            expect(() => tsdbService.saveSnapshot({ cpu: 10, memory: 20, disk: 5 }, [{ id: 'a1', status: 'active_executing', cost: 0 }])).not.toThrow();
        });

        it('handles empty agents array', () => {
            expect(() => tsdbService.saveSnapshot({ cpu: 5, memory: 40, disk: 20 }, [])).not.toThrow();
        });
    });

    describe('getSystemHistory', () => {
        it('returns an array', () => {
            expect(Array.isArray(tsdbService.getSystemHistory(10))).toBe(true);
        });

        it('uses default limit', () => {
            expect(Array.isArray(tsdbService.getSystemHistory())).toBe(true);
        });

        it('respects limit', () => {
            for (let i = 0; i < 5; i++) tsdbService.saveSnapshot({ cpu: i, memory: i, disk: i }, []);
            const h = tsdbService.getSystemHistory(2);
            expect(h.length).toBeLessThanOrEqual(2);
        });
    });

    describe('getAgentTopTokens', () => {
        it('returns array', () => {
            expect(Array.isArray(tsdbService.getAgentTopTokens(5))).toBe(true);
        });

        it('uses default limit', () => {
            expect(Array.isArray(tsdbService.getAgentTopTokens())).toBe(true);
        });
    });

    describe('getCostHistory', () => {
        it('returns array', () => {
            expect(Array.isArray(tsdbService.getCostHistory(10))).toBe(true);
        });

        it('uses default limit', () => {
            expect(Array.isArray(tsdbService.getCostHistory())).toBe(true);
        });
    });

    describe('saveSnapshot - error path', () => {
        it('handles agent with null status gracefully', () => {
            // status is null → null.includes() throws → caught by try/catch
            expect(() => tsdbService.saveSnapshot(
                { cpu: 5, memory: 5, disk: 5 },
                [{ id: 'broken', status: null, cost: 0 }]
            )).not.toThrow();
        });
    });

    describe('getAgentActivitySummary', () => {
        it('returns array', () => {
            expect(Array.isArray(tsdbService.getAgentActivitySummary())).toBe(true);
        });

        it('returns objects with expected shape when data exists', () => {
            tsdbService.saveSnapshot({ cpu: 1, memory: 1, disk: 1 }, [
                { id: 'main', status: 'active_executing', cost: 0.01, tokens: { input: 10, output: 5 } }
            ]);
            const result = tsdbService.getAgentActivitySummary();
            if (result.length > 0) {
                expect(result[0]).toHaveProperty('agent_id');
                expect(result[0]).toHaveProperty('active_minutes');
                expect(result[0]).toHaveProperty('last_seen');
            }
        });
    });
});
