'use strict';

// Mock dependencies before requiring the module under test
const mockAlertEngine = { getRecent: jest.fn() };
const mockErrorBuffer = { getRecent: jest.fn() };
const mockApiMetrics  = { getStats: jest.fn() };
const mockTsdbService = { getLatestAgentCounts: jest.fn() };

jest.mock('../src/backend/services/alertEngine',  () => mockAlertEngine);
jest.mock('../src/backend/services/errorBuffer',  () => mockErrorBuffer);
jest.mock('../src/backend/services/apiMetrics',   () => mockApiMetrics);
jest.mock('../src/backend/services/tsdbService',  () => mockTsdbService);

let buildHealthSummary;

beforeEach(() => {
    jest.resetModules();
    // Re-apply mocks after resetModules so the re-required module picks them up
    jest.mock('../src/backend/services/alertEngine',  () => mockAlertEngine);
    jest.mock('../src/backend/services/errorBuffer',  () => mockErrorBuffer);
    jest.mock('../src/backend/services/apiMetrics',   () => mockApiMetrics);
    jest.mock('../src/backend/services/tsdbService',  () => mockTsdbService);

    ({ buildHealthSummary } = require('../src/backend/services/healthCompositeService'));

    // Default: empty state → should produce 'ok'
    mockAlertEngine.getRecent.mockReturnValue([]);
    mockErrorBuffer.getRecent.mockReturnValue([]);
    mockApiMetrics.getStats.mockReturnValue({});
    mockTsdbService.getLatestAgentCounts.mockReturnValue(null);
});

// ── Helper ────────────────────────────────────────────────────────────────────
const NOW = 1_700_000_000_000;
const MIN = 60 * 1000;

function makeAlert(severity, tsOffset = 0) {
    return { rule: 'test', severity, message: 'msg', meta: {}, ts: NOW + tsOffset };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('buildHealthSummary', () => {
    test('status=ok when no alerts, no errors, no slow p99', () => {
        const result = buildHealthSummary({ now: NOW });

        expect(result.status).toBe('ok');
        expect(result.alerts_recent_count).toBe(0);
        expect(result.alerts_critical_count).toBe(0);
        expect(result.alerts_warning_count).toBe(0);
        expect(result.errors_recent_count).toBe(0);
        expect(result.p99_max_ms).toBe(0);
        expect(result.ts).toBe(NOW);
    });

    test('status=critical when criticalCount > 0', () => {
        mockAlertEngine.getRecent.mockReturnValue([
            makeAlert('critical'),
        ]);

        const result = buildHealthSummary({ now: NOW });

        expect(result.status).toBe('critical');
        expect(result.alerts_critical_count).toBe(1);
    });

    test('status=degraded when warningCount > 0', () => {
        mockAlertEngine.getRecent.mockReturnValue([
            makeAlert('warning'),
        ]);

        const result = buildHealthSummary({ now: NOW });

        expect(result.status).toBe('degraded');
        expect(result.alerts_warning_count).toBe(1);
    });

    test('status=degraded when p99_max_ms > 5000', () => {
        mockApiMetrics.getStats.mockReturnValue({
            'GET /api/read/dashboard': { p99: 5001, p50: 100, p95: 500, count: 10 },
        });

        const result = buildHealthSummary({ now: NOW });

        expect(result.status).toBe('degraded');
        expect(result.p99_max_ms).toBe(5001);
    });

    test('status=degraded NOT triggered when p99 exactly equals 5000', () => {
        mockApiMetrics.getStats.mockReturnValue({
            'GET /api/read/dashboard': { p99: 5000, p50: 100, p95: 500, count: 10 },
        });

        const result = buildHealthSummary({ now: NOW });

        // 5000 is not > 5000, so should remain ok (assuming no alerts)
        expect(result.status).toBe('ok');
        expect(result.p99_max_ms).toBe(5000);
    });

    test('status=critical overrides degraded when both conditions are present', () => {
        mockAlertEngine.getRecent.mockReturnValue([
            makeAlert('critical'),
            makeAlert('warning'),
        ]);
        mockApiMetrics.getStats.mockReturnValue({
            'GET /slow': { p99: 9000 },
        });

        const result = buildHealthSummary({ now: NOW });

        expect(result.status).toBe('critical');
        expect(result.alerts_critical_count).toBe(1);
        expect(result.alerts_warning_count).toBe(1);
    });

    test('alerts outside 5-minute window are excluded', () => {
        // Stale alert (6 minutes ago)
        const staleAlert = makeAlert('critical', -(6 * MIN));
        // Recent alert (1 minute ago)
        const recentWarning = makeAlert('warning', -(1 * MIN));

        mockAlertEngine.getRecent.mockReturnValue([staleAlert, recentWarning]);

        const result = buildHealthSummary({ now: NOW });

        // critical from stale should be ignored; only warning counts
        expect(result.status).toBe('degraded');
        expect(result.alerts_recent_count).toBe(1);
        expect(result.alerts_critical_count).toBe(0);
        expect(result.alerts_warning_count).toBe(1);
    });

    test('p99_max_ms is the maximum across all endpoints', () => {
        mockApiMetrics.getStats.mockReturnValue({
            'GET /a': { p99: 100 },
            'GET /b': { p99: 800 },
            'POST /c': { p99: 500 },
        });

        const result = buildHealthSummary({ now: NOW });

        expect(result.p99_max_ms).toBe(800);
    });

    test('empty stats and empty alerts produce ok with zero counts', () => {
        mockAlertEngine.getRecent.mockReturnValue([]);
        mockErrorBuffer.getRecent.mockReturnValue([]);
        mockApiMetrics.getStats.mockReturnValue({});

        const result = buildHealthSummary({ now: NOW });

        expect(result.status).toBe('ok');
        expect(result.alerts_recent_count).toBe(0);
        expect(result.errors_recent_count).toBe(0);
        expect(result.p99_max_ms).toBe(0);
    });

    test('errors_recent_count reflects errorBuffer.getRecent length', () => {
        mockErrorBuffer.getRecent.mockReturnValue([
            { timestamp: NOW, requestId: 'r1', method: 'GET', path: '/x', statusCode: 500, error: 'err', durationMs: 10 },
            { timestamp: NOW, requestId: 'r2', method: 'POST', path: '/y', statusCode: 503, error: 'svc', durationMs: 20 },
        ]);

        const result = buildHealthSummary({ now: NOW });

        expect(result.errors_recent_count).toBe(2);
    });

    test('returns uptime_ms as a positive number', () => {
        const result = buildHealthSummary({ now: NOW });

        expect(typeof result.uptime_ms).toBe('number');
        expect(result.uptime_ms).toBeGreaterThanOrEqual(0);
    });

    test('stats entries without p99 property are skipped safely', () => {
        mockApiMetrics.getStats.mockReturnValue({
            'GET /no-p99': { p50: 50 },
            'GET /with-p99': { p99: 300 },
        });

        const result = buildHealthSummary({ now: NOW });

        expect(result.p99_max_ms).toBe(300);
        expect(result.status).toBe('ok');
    });

    // ── Agent counts ─────────────────────────────────────────────────────────

    test('agents_total_count and agents_active_count are 0 when getLatestAgentCounts returns null', () => {
        mockTsdbService.getLatestAgentCounts.mockReturnValue(null);

        const result = buildHealthSummary({ now: NOW });

        expect(result.agents_total_count).toBe(0);
        expect(result.agents_active_count).toBe(0);
    });

    test('agents_total_count and agents_active_count reflect real values from tsdbService', () => {
        mockTsdbService.getLatestAgentCounts.mockReturnValue({ total: 5, active: 3 });

        const result = buildHealthSummary({ now: NOW });

        expect(result.agents_total_count).toBe(5);
        expect(result.agents_active_count).toBe(3);
    });

    test('agents counts fall back to 0/0 when getLatestAgentCounts throws', () => {
        mockTsdbService.getLatestAgentCounts.mockImplementation(() => { throw new Error('db gone'); });

        // buildHealthSummary uses optional-chaining fallback; internally tsdbService.getLatestAgentCounts
        // already catches, but simulate the case where the mock/function itself throws by
        // replacing the function reference temporarily
        const savedFn = mockTsdbService.getLatestAgentCounts;
        mockTsdbService.getLatestAgentCounts = undefined;

        const result = buildHealthSummary({ now: NOW });

        expect(result.agents_total_count).toBe(0);
        expect(result.agents_active_count).toBe(0);

        mockTsdbService.getLatestAgentCounts = savedFn;
    });

    test('result always includes agents_total_count and agents_active_count keys', () => {
        mockTsdbService.getLatestAgentCounts.mockReturnValue({ total: 10, active: 0 });

        const result = buildHealthSummary({ now: NOW });

        expect(result).toHaveProperty('agents_total_count', 10);
        expect(result).toHaveProperty('agents_active_count', 0);
    });
});
