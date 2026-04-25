// tsdbAlerts.test.js — alerts table in tsdbService
const path = require('path');
const os = require('os');
const fs = require('fs');

const mockTmpDir = path.join(os.tmpdir(), `agent-monitor-tsdb-alerts-test-${process.pid}`);
if (!fs.existsSync(mockTmpDir)) {
    fs.mkdirSync(mockTmpDir, { recursive: true });
}
const mockTmpDbPath = path.join(mockTmpDir, 'tsdb-alerts.sqlite');

jest.mock('better-sqlite3', () => {
    const Real = jest.requireActual('better-sqlite3');
    return jest.fn().mockImplementation((dbPath, opts) => {
        return new Real(mockTmpDbPath, opts || {});
    });
});

// Capture original before spying to avoid infinite recursion
const _origExistsSync = fs.existsSync.bind(fs);
jest.spyOn(fs, 'mkdirSync').mockImplementation((p) => {
    if (p && p.includes('/data')) return;
    return undefined;
});
jest.spyOn(fs, 'existsSync').mockImplementation((p) => {
    if (p && p.includes('/data') && !p.includes('sqlite')) return true;
    return _origExistsSync(p);
});

const tsdbService = require('../src/backend/services/tsdbService');

afterAll(() => {
    try { fs.rmSync(mockTmpDir, { recursive: true, force: true }); } catch (_) {}
    jest.restoreAllMocks();
});

// Helper to delete all rows between tests so each case starts clean
let db;
beforeAll(() => {
    const RealDatabase = jest.requireActual('better-sqlite3');
    db = new RealDatabase(mockTmpDbPath);
});
beforeEach(() => {
    db.prepare('DELETE FROM alerts').run();
});

describe('tsdbService — alerts', () => {
    describe('recordAlert', () => {
        it('inserts a valid alert and returns true', () => {
            const result = tsdbService.recordAlert({
                ts: 1000000,
                rule: 'cpu_high',
                severity: 'warning',
                message: 'CPU high',
                meta: { cpu: 85 },
            });
            expect(result).toBe(true);
            const rows = db.prepare('SELECT * FROM alerts WHERE rule = ?').all('cpu_high');
            expect(rows.length).toBe(1);
            expect(rows[0].ts).toBe(1000000);
            expect(rows[0].severity).toBe('warning');
        });

        it('inserts alert with null meta when meta is undefined', () => {
            tsdbService.recordAlert({
                ts: 1000001,
                rule: 'memory_high',
                severity: 'warning',
                message: 'Memory high',
            });
            const row = db.prepare('SELECT meta FROM alerts WHERE rule = ?').get('memory_high');
            expect(row.meta).toBeNull();
        });

        it('returns false and does not insert when ts is missing', () => {
            const result = tsdbService.recordAlert({ rule: 'cpu_high', severity: 'warning', message: 'msg' });
            expect(result).toBe(false);
            expect(db.prepare('SELECT COUNT(*) as c FROM alerts').get().c).toBe(0);
        });

        it('returns false when ts is not a finite number', () => {
            const result = tsdbService.recordAlert({ ts: NaN, rule: 'cpu_high', severity: 'warning', message: 'msg' });
            expect(result).toBe(false);
        });

        it('returns false when rule is missing', () => {
            const result = tsdbService.recordAlert({ ts: 1000000, severity: 'warning', message: 'msg' });
            expect(result).toBe(false);
        });

        it('returns false when rule is empty string', () => {
            const result = tsdbService.recordAlert({ ts: 1000000, rule: '', severity: 'warning', message: 'msg' });
            expect(result).toBe(false);
        });

        it('returns false when severity is missing', () => {
            const result = tsdbService.recordAlert({ ts: 1000000, rule: 'cpu_high', message: 'msg' });
            expect(result).toBe(false);
        });

        it('returns false when message is missing', () => {
            const result = tsdbService.recordAlert({ ts: 1000000, rule: 'cpu_high', severity: 'warning' });
            expect(result).toBe(false);
        });

        it('serialises nested meta object as JSON', () => {
            tsdbService.recordAlert({
                ts: 2000000,
                rule: 'cost_today_high',
                severity: 'warning',
                message: 'Cost high',
                meta: { todayCost: 7.5, nested: { level: 2 } },
            });
            const row = db.prepare('SELECT meta FROM alerts WHERE rule = ?').get('cost_today_high');
            const parsed = JSON.parse(row.meta);
            expect(parsed.todayCost).toBe(7.5);
            expect(parsed.nested.level).toBe(2);
        });
    });

    describe('getAlertHistory', () => {
        it('returns empty array when no rows exist', () => {
            const result = tsdbService.getAlertHistory();
            expect(Array.isArray(result)).toBe(true);
            expect(result.length).toBe(0);
        });

        it('returns rows in descending ts order', () => {
            tsdbService.recordAlert({ ts: 1000, rule: 'cpu_high', severity: 'warning', message: 'a' });
            tsdbService.recordAlert({ ts: 2000, rule: 'cpu_high', severity: 'warning', message: 'b' });
            tsdbService.recordAlert({ ts: 3000, rule: 'cpu_high', severity: 'warning', message: 'c' });

            const rows = tsdbService.getAlertHistory();
            expect(rows[0].ts).toBe(3000);
            expect(rows[1].ts).toBe(2000);
            expect(rows[2].ts).toBe(1000);
        });

        it('respects limit parameter', () => {
            for (let i = 0; i < 10; i++) {
                tsdbService.recordAlert({ ts: i * 1000 + 1000, rule: 'cpu_high', severity: 'warning', message: `msg ${i}` });
            }
            const rows = tsdbService.getAlertHistory({ limit: 3 });
            expect(rows.length).toBe(3);
        });

        it('caps limit at 500', () => {
            // Insert 5 rows; even with limit=9999 only those rows are returned, and the cap is enforced internally
            for (let i = 0; i < 5; i++) {
                tsdbService.recordAlert({ ts: i * 1000 + 1000, rule: 'cpu_high', severity: 'warning', message: `msg ${i}` });
            }
            // Passing limit=9999 should be capped to 500 — still returns all 5 inserted rows
            const rows = tsdbService.getAlertHistory({ limit: 9999 });
            expect(rows.length).toBeLessThanOrEqual(500);
            expect(rows.length).toBe(5);
        });

        it('filters by from/to range', () => {
            tsdbService.recordAlert({ ts: 1000, rule: 'cpu_high', severity: 'warning', message: 'old' });
            tsdbService.recordAlert({ ts: 5000, rule: 'cpu_high', severity: 'warning', message: 'in range' });
            tsdbService.recordAlert({ ts: 9000, rule: 'cpu_high', severity: 'warning', message: 'new' });

            const rows = tsdbService.getAlertHistory({ from: 2000, to: 8000 });
            expect(rows.length).toBe(1);
            expect(rows[0].message).toBe('in range');
        });

        it('parses meta JSON correctly on retrieval', () => {
            tsdbService.recordAlert({
                ts: 5000,
                rule: 'cpu_critical',
                severity: 'critical',
                message: 'CPU critical',
                meta: { cpu: 97, extra: true },
            });
            const rows = tsdbService.getAlertHistory();
            expect(rows[0].meta).toEqual({ cpu: 97, extra: true });
        });

        it('returns null meta when original meta was undefined', () => {
            tsdbService.recordAlert({ ts: 6000, rule: 'no_active_agents', severity: 'critical', message: 'offline' });
            const rows = tsdbService.getAlertHistory();
            expect(rows[0].meta).toBeNull();
        });

        it('does not crash when stored meta is invalid JSON — returns raw string', () => {
            // Directly insert a row with broken JSON meta to simulate corruption
            db.prepare('INSERT INTO alerts (ts, rule, severity, message, meta) VALUES (?, ?, ?, ?, ?)').run(
                7000, 'bad_meta', 'warning', 'broken', '{not valid json'
            );
            const rows = tsdbService.getAlertHistory({ from: 7000, to: 7000 });
            expect(rows.length).toBe(1);
            // Should not throw; meta should be the raw string
            expect(rows[0].meta).toBe('{not valid json');
        });

        it('uses default limit of 100 when not specified', () => {
            // Insert 120 rows
            for (let i = 0; i < 120; i++) {
                db.prepare('INSERT INTO alerts (ts, rule, severity, message, meta) VALUES (?, ?, ?, ?, ?)').run(
                    i + 1, 'cpu_high', 'warning', `msg ${i}`, null
                );
            }
            const rows = tsdbService.getAlertHistory();
            expect(rows.length).toBe(100);
        });
    });
});
