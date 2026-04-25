// insightsService tests — each heuristic tested in isolation via mocks

jest.mock('../src/backend/services/tsdbService', () => ({
    getCostHistory: jest.fn(),
    getAgentActivitySummary: jest.fn(),
}));

jest.mock('../src/backend/services/errorBuffer', () => ({
    getRecent: jest.fn(),
}));

jest.mock('../src/backend/services/apiMetrics', () => ({
    getStats: jest.fn(),
}));

jest.mock('../src/backend/services/alertEngine', () => ({
    getRecent: jest.fn(),
}));

const tsdbService = require('../src/backend/services/tsdbService');
const errorBuffer = require('../src/backend/services/errorBuffer');
const apiMetrics = require('../src/backend/services/apiMetrics');
const alertEngine = require('../src/backend/services/alertEngine');
const {
    buildInsights,
    _checkCost24hChange,
    _checkErrorsRecentSpike,
    _checkAgentIdle,
    _checkP99Spike,
    _checkAlertStorm,
    _checkRateLimitPattern,
} = require('../src/backend/services/insightsService');

describe('insightsService — checkCost24hChange', () => {
    const NOW = Date.now();

    it('returns null when no cost history', () => {
        tsdbService.getCostHistory.mockReturnValue([]);
        expect(_checkCost24hChange(NOW)).toBeNull();
    });

    it('returns null when change < 10%', () => {
        const rows = [
            { ts: new Date(NOW - 1 * 3600000).toISOString(), total_cost: 1.05 },
            { ts: new Date(NOW - 25 * 3600000).toISOString(), total_cost: 1.00 },
        ];
        tsdbService.getCostHistory.mockReturnValue(rows);
        expect(_checkCost24hChange(NOW)).toBeNull();
    });

    it('returns info insight when change 10–19%', () => {
        const rows = [
            { ts: new Date(NOW - 1 * 3600000).toISOString(), total_cost: 1.15 },
            { ts: new Date(NOW - 25 * 3600000).toISOString(), total_cost: 1.00 },
        ];
        tsdbService.getCostHistory.mockReturnValue(rows);
        const result = _checkCost24hChange(NOW);
        expect(result).not.toBeNull();
        expect(result.type).toBe('cost_24h_change');
        expect(result.severity).toBe('info');
    });

    it('returns warning insight when change >= 20%', () => {
        const rows = [
            { ts: new Date(NOW - 1 * 3600000).toISOString(), total_cost: 1.30 },
            { ts: new Date(NOW - 25 * 3600000).toISOString(), total_cost: 1.00 },
        ];
        tsdbService.getCostHistory.mockReturnValue(rows);
        const result = _checkCost24hChange(NOW);
        expect(result).not.toBeNull();
        expect(result.severity).toBe('warning');
        expect(result.message).toContain('↑');
    });
});

describe('insightsService — checkErrorsRecentSpike', () => {
    const NOW = Date.now();

    it('returns null when no errors', () => {
        errorBuffer.getRecent.mockReturnValue([]);
        expect(_checkErrorsRecentSpike(NOW)).toBeNull();
    });

    it('returns null when lastHour < 3', () => {
        const errors = [
            { timestamp: new Date(NOW - 10 * 60000).toISOString() },
            { timestamp: new Date(NOW - 20 * 60000).toISOString() },
        ];
        errorBuffer.getRecent.mockReturnValue(errors);
        expect(_checkErrorsRecentSpike(NOW)).toBeNull();
    });

    it('fires warning when lastHour > prior6hAvg * 3 and lastHour >= 3', () => {
        const inLastHour = Array.from({ length: 6 }, (_, i) => ({
            timestamp: new Date(NOW - (i + 1) * 5 * 60000).toISOString(),
        }));
        // prior 6h: 0 errors (avg = 0) — ratio check: 6 >= 3 && 6 > 0 — wait: prior6hAvg=0 → 0*3=0
        // 6 > 0 is true; and 6 >= 3 is true → should fire
        errorBuffer.getRecent.mockReturnValue(inLastHour);
        const result = _checkErrorsRecentSpike(NOW);
        expect(result).not.toBeNull();
        expect(result.type).toBe('errors_recent_spike');
        expect(result.severity).toBe('warning');
        expect(result.meta.lastHour).toBe(6);
    });

    it('does not fire when spike is below 3x threshold', () => {
        // 3 in last hour, 4 in prior 6h (avg = 0.67) → 3 > 0.67*3=2 → should fire
        // Actually: 3 > 2 and lastHour >= 3 → fires. Let me build a case that doesn't.
        // 3 in last hour, 12 in prior 6h (avg = 2.0) → 3 > 6? No. So no fire.
        const lastHourErrs = Array.from({ length: 3 }, (_, i) => ({
            timestamp: new Date(NOW - (i + 1) * 10 * 60000).toISOString(),
        }));
        const priorErrs = Array.from({ length: 12 }, (_, i) => ({
            timestamp: new Date(NOW - (2 + i * 0.3) * 3600000).toISOString(),
        }));
        errorBuffer.getRecent.mockReturnValue([...lastHourErrs, ...priorErrs]);
        expect(_checkErrorsRecentSpike(NOW)).toBeNull();
    });
});

describe('insightsService — checkAgentIdle', () => {
    const NOW = Date.now();

    it('returns null when no agents', () => {
        tsdbService.getAgentActivitySummary.mockReturnValue([]);
        expect(_checkAgentIdle(NOW)).toBeNull();
    });

    it('returns null when all agents active within 24h', () => {
        tsdbService.getAgentActivitySummary.mockReturnValue([
            { agent_id: 'a1', active_minutes: 10, last_seen: new Date(NOW - 2 * 3600000).toISOString() },
        ]);
        expect(_checkAgentIdle(NOW)).toBeNull();
    });

    it('fires warning for agent idle > 24h', () => {
        tsdbService.getAgentActivitySummary.mockReturnValue([
            { agent_id: 'stale-agent', active_minutes: 0, last_seen: new Date(NOW - 36 * 3600000).toISOString() },
        ]);
        const result = _checkAgentIdle(NOW);
        expect(result).not.toBeNull();
        expect(result.type).toBe('agent_idle');
        expect(result.severity).toBe('warning');
        expect(result.message).toContain('stale-agent');
        expect(result.meta.idleHours).toBe(36);
    });

    it('picks the most stale agent when multiple are idle', () => {
        tsdbService.getAgentActivitySummary.mockReturnValue([
            { agent_id: 'agent-30h', active_minutes: 0, last_seen: new Date(NOW - 30 * 3600000).toISOString() },
            { agent_id: 'agent-48h', active_minutes: 0, last_seen: new Date(NOW - 48 * 3600000).toISOString() },
        ]);
        const result = _checkAgentIdle(NOW);
        expect(result.meta.agent_id).toBe('agent-48h');
    });
});

describe('insightsService — checkP99Spike', () => {
    const NOW = Date.now();

    it('returns null when stats empty', () => {
        apiMetrics.getStats.mockReturnValue({});
        expect(_checkP99Spike(NOW)).toBeNull();
    });

    it('returns null when p99 < 1000ms', () => {
        apiMetrics.getStats.mockReturnValue({
            'GET /api/health': { p99: 200 },
        });
        expect(_checkP99Spike(NOW)).toBeNull();
    });

    it('returns info when 1000 <= p99 < 3000', () => {
        apiMetrics.getStats.mockReturnValue({
            'GET /api/dashboard': { p99: 1500 },
        });
        const result = _checkP99Spike(NOW);
        expect(result).not.toBeNull();
        expect(result.severity).toBe('info');
        expect(result.meta.p99).toBe(1500);
    });

    it('returns warning when p99 >= 3000ms', () => {
        apiMetrics.getStats.mockReturnValue({
            'POST /api/slow': { p99: 4200 },
        });
        const result = _checkP99Spike(NOW);
        expect(result).not.toBeNull();
        expect(result.severity).toBe('warning');
        expect(result.message).toContain('高延遲警告');
    });
});

describe('insightsService — checkAlertStorm', () => {
    const NOW = Date.now();

    it('returns null when alerts empty', () => {
        alertEngine.getRecent.mockReturnValue([]);
        expect(_checkAlertStorm(NOW)).toBeNull();
    });

    it('returns null when <= 10 alerts in last hour', () => {
        const alerts = Array.from({ length: 10 }, (_, i) => ({ ts: NOW - i * 60000 }));
        alertEngine.getRecent.mockReturnValue(alerts);
        expect(_checkAlertStorm(NOW)).toBeNull();
    });

    it('fires critical when > 10 alerts in last hour', () => {
        const alerts = Array.from({ length: 15 }, (_, i) => ({ ts: NOW - i * 60000 }));
        alertEngine.getRecent.mockReturnValue(alerts);
        const result = _checkAlertStorm(NOW);
        expect(result).not.toBeNull();
        expect(result.type).toBe('alert_storm');
        expect(result.severity).toBe('critical');
        expect(result.meta.count).toBe(15);
    });

    it('ignores alerts older than 1 hour', () => {
        const alerts = [
            ...Array.from({ length: 5 }, (_, i) => ({ ts: NOW - i * 60000 })),
            ...Array.from({ length: 20 }, (_, i) => ({ ts: NOW - (2 + i) * 3600000 })),
        ];
        alertEngine.getRecent.mockReturnValue(alerts);
        expect(_checkAlertStorm(NOW)).toBeNull();
    });
});

describe('insightsService — checkRateLimitPattern', () => {
    const NOW = Date.now();

    it('returns null when stats empty', () => {
        apiMetrics.getStats.mockReturnValue({});
        expect(_checkRateLimitPattern(NOW)).toBeNull();
    });

    it('returns null when max 429 count < 5', () => {
        apiMetrics.getStats.mockReturnValue({
            'POST /api/login': { errorCount: { '429': 4 } },
        });
        expect(_checkRateLimitPattern(NOW)).toBeNull();
    });

    it('fires warning when 429 count >= 5', () => {
        apiMetrics.getStats.mockReturnValue({
            'POST /api/login': { errorCount: { '429': 8 } },
            'GET /api/data': { errorCount: { '429': 2 } },
        });
        const result = _checkRateLimitPattern(NOW);
        expect(result).not.toBeNull();
        expect(result.type).toBe('rate_limit_pattern');
        expect(result.severity).toBe('warning');
        expect(result.meta.endpoint).toBe('POST /api/login');
        expect(result.meta.count).toBe(8);
    });
});

describe('insightsService — buildInsights', () => {
    const NOW = Date.now();

    beforeEach(() => {
        // Default: no data → all heuristics return null
        tsdbService.getCostHistory.mockReturnValue([]);
        tsdbService.getAgentActivitySummary.mockReturnValue([]);
        errorBuffer.getRecent.mockReturnValue([]);
        apiMetrics.getStats.mockReturnValue({});
        alertEngine.getRecent.mockReturnValue([]);
    });

    it('returns empty array when no heuristic fires', () => {
        const results = buildInsights(NOW);
        expect(results).toEqual([]);
    });

    it('sorts critical before warning before info', () => {
        // alert_storm → critical
        alertEngine.getRecent.mockReturnValue(
            Array.from({ length: 15 }, (_, i) => ({ ts: NOW - i * 60000 }))
        );
        // p99 warning
        apiMetrics.getStats.mockReturnValue({ 'GET /x': { p99: 5000, errorCount: { '429': 0 } } });

        const results = buildInsights(NOW);
        expect(results.length).toBeGreaterThan(0);
        expect(results[0].severity).toBe('critical');
    });

    it('returns at most 5 insights', () => {
        // Trigger all 6 heuristics
        const costRows = [
            { ts: new Date(NOW - 1 * 3600000).toISOString(), total_cost: 1.30 },
            { ts: new Date(NOW - 25 * 3600000).toISOString(), total_cost: 1.00 },
        ];
        tsdbService.getCostHistory.mockReturnValue(costRows);
        errorBuffer.getRecent.mockReturnValue(
            Array.from({ length: 6 }, (_, i) => ({ timestamp: new Date(NOW - (i + 1) * 5 * 60000).toISOString() }))
        );
        tsdbService.getAgentActivitySummary.mockReturnValue([
            { agent_id: 'old', active_minutes: 0, last_seen: new Date(NOW - 30 * 3600000).toISOString() },
        ]);
        apiMetrics.getStats.mockReturnValue({ 'GET /slow': { p99: 4000, errorCount: { '429': 10 } } });
        alertEngine.getRecent.mockReturnValue(
            Array.from({ length: 15 }, (_, i) => ({ ts: NOW - i * 60000 }))
        );

        const results = buildInsights(NOW);
        expect(results.length).toBeLessThanOrEqual(5);
    });

    it('silently skips a heuristic that throws', () => {
        tsdbService.getCostHistory.mockImplementation(() => { throw new Error('db error'); });
        // Should not throw; just return whatever other heuristics give
        expect(() => buildInsights(NOW)).not.toThrow();
    });
});
