const alertEngine = require('../src/backend/services/alertEngine');
const apiMetrics = require('../src/backend/services/apiMetrics');
const errorBuffer = require('../src/backend/services/errorBuffer');
const tsdbService = require('../src/backend/services/tsdbService');

describe('AlertEngine', () => {
    beforeEach(() => alertEngine.resetForTesting());

    it('triggers cpu_high warning when cpu > 80', () => {
        const alerts = alertEngine.evaluate({ sys: { cpu: 85, memory: 50, disk: 40 }, agents: [] });
        expect(alerts.some(a => a.rule === 'cpu_high' && a.severity === 'warning')).toBe(true);
    });

    it('triggers cpu_critical when cpu > 95', () => {
        const alerts = alertEngine.evaluate({ sys: { cpu: 96, memory: 50, disk: 40 }, agents: [] });
        expect(alerts.some(a => a.rule === 'cpu_critical' && a.severity === 'critical')).toBe(true);
    });

    it('triggers memory_high when memory > 85', () => {
        const alerts = alertEngine.evaluate({ sys: { cpu: 20, memory: 90, disk: 40 }, agents: [] });
        expect(alerts.some(a => a.rule === 'memory_high')).toBe(true);
    });

    it('triggers no_active_agents when agents drop from >0 to 0', () => {
        alertEngine.evaluate({ sys: { cpu: 20, memory: 50, disk: 40 }, agents: [{ status: 'active_executing' }] });
        const alerts = alertEngine.evaluate({ sys: { cpu: 20, memory: 50, disk: 40 }, agents: [] });
        expect(alerts.some(a => a.rule === 'no_active_agents')).toBe(true);
    });

    it('does NOT fire no_active_agents on cold start when agents are already offline', () => {
        // prevActiveCount starts at -1 after reset, so dropping to 0 should not fire
        const alerts = alertEngine.evaluate({ sys: { cpu: 20, memory: 50, disk: 40 }, agents: [] });
        expect(alerts.some(a => a.rule === 'no_active_agents')).toBe(false);
    });

    it('respects cooldown: same rule does not fire twice within 5 minutes', () => {
        alertEngine.evaluate({ sys: { cpu: 96, memory: 50, disk: 40 }, agents: [] });
        const second = alertEngine.evaluate({ sys: { cpu: 97, memory: 50, disk: 40 }, agents: [] });
        expect(second.some(a => a.rule === 'cpu_critical')).toBe(false);
    });

    it('getRecent returns last N alerts', () => {
        alertEngine.evaluate({ sys: { cpu: 85, memory: 50, disk: 40 }, agents: [] });
        expect(alertEngine.getRecent(10).length).toBeGreaterThan(0);
    });

    it('getRecent uses default limit of 50 when called without args', () => {
        expect(Array.isArray(alertEngine.getRecent())).toBe(true);
    });

    it('updateConfig ignores unknown rule names (continue branch)', () => {
        const config = alertEngine.getConfig();
        // Pass an unknown rule — should be silently skipped
        alertEngine.updateConfig({ rules: { unknown_rule: { threshold: 99 } } });
        // Config should remain unchanged
        expect(alertEngine.getConfig().rules.cpu_high.threshold).toBe(config.rules.cpu_high.threshold);
    });

    it('updateConfig updates enabled to boolean false (TRUE branch of typeof check)', () => {
        alertEngine.updateConfig({ rules: { cpu_high: { enabled: false } } });
        expect(alertEngine.getConfig().rules.cpu_high.enabled).toBe(false);
    });

    it('updateConfig skips enabled update when value is not boolean', () => {
        alertEngine.updateConfig({ rules: { cpu_high: { enabled: 'yes' } } });
        // Should still be true (not changed by non-boolean)
        expect(alertEngine.getConfig().rules.cpu_high.enabled).toBe(true);
    });

    it('updateConfig updates threshold to valid finite number (TRUE branch)', () => {
        alertEngine.updateConfig({ rules: { cpu_high: { threshold: 75 } } });
        expect(alertEngine.getConfig().rules.cpu_high.threshold).toBe(75);
    });

    it('updateConfig skips threshold update when value is not a finite number', () => {
        const original = alertEngine.getConfig().rules.cpu_high.threshold;
        alertEngine.updateConfig({ rules: { cpu_high: { threshold: NaN } } });
        expect(alertEngine.getConfig().rules.cpu_high.threshold).toBe(original);
    });

    it('updateConfig with empty patch (no rules key) covers || {} false branch', () => {
        const config = alertEngine.getConfig();
        alertEngine.updateConfig({});
        // Config should be unchanged
        expect(alertEngine.getConfig().rules.cpu_high.threshold).toBe(config.rules.cpu_high.threshold);
    });

    it('evaluates cpu_high else-if branch (cpu between thresholds)', () => {
        // cpu 85 > high(80) but <= critical(95) → only cpu_high fires, not cpu_critical
        const alerts = alertEngine.evaluate({ sys: { cpu: 85, memory: 50, disk: 40 }, agents: [] });
        expect(alerts.some(a => a.rule === 'cpu_high')).toBe(true);
        expect(alerts.some(a => a.rule === 'cpu_critical')).toBe(false);
    });

    describe('cost_today_high', () => {
        const sys = { cpu: 20, memory: 50, disk: 40 };

        it('fires when sum of agents.costs.today exceeds threshold', () => {
            // default threshold: 5 USD
            const alerts = alertEngine.evaluate({
                sys,
                agents: [
                    { costs: { today: 3.5 } },
                    { costs: { today: 2.0 } },
                ],
            });
            const cost = alerts.find(a => a.rule === 'cost_today_high');
            expect(cost).toBeDefined();
            expect(cost.severity).toBe('warning');
            expect(cost.meta.todayCost).toBeCloseTo(5.5, 2);
            expect(cost.meta.threshold).toBe(5);
        });

        it('does NOT re-fire while still above threshold (hysteresis latch)', () => {
            // First evaluate triggers fire + sets latch
            alertEngine.evaluate({ sys, agents: [{ costs: { today: 10 } }] });
            // Second evaluate, still above threshold — latch blocks even if cooldown not blocking
            const second = alertEngine.evaluate({ sys, agents: [{ costs: { today: 12 } }] });
            expect(second.some(a => a.rule === 'cost_today_high')).toBe(false);
        });

        it('fires again after latch reset + cooldown expired (re-crossing)', () => {
            jest.useFakeTimers();
            jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));
            try {
                alertEngine.evaluate({ sys, agents: [{ costs: { today: 10 } }] });  // fire #1 + latch=true
                alertEngine.evaluate({ sys, agents: [{ costs: { today: 2 } }] });   // drop → latch=false
                jest.advanceTimersByTime(6 * 60 * 1000);                             // past 5min cooldown
                const third = alertEngine.evaluate({ sys, agents: [{ costs: { today: 10 } }] });
                expect(third.some(a => a.rule === 'cost_today_high')).toBe(true);
            } finally {
                jest.useRealTimers();
            }
        });

        it('does not fire when disabled', () => {
            alertEngine.updateConfig({ rules: { cost_today_high: { enabled: false } } });
            const alerts = alertEngine.evaluate({
                sys,
                agents: [{ costs: { today: 100 } }],
            });
            expect(alerts.some(a => a.rule === 'cost_today_high')).toBe(false);
        });

        it('does not crash when agent has no costs field', () => {
            expect(() => {
                alertEngine.evaluate({
                    sys,
                    agents: [
                        { id: 'a' },
                        { costs: { today: 3 } },
                        { costs: {} },
                    ],
                });
            }).not.toThrow();
        });

        it('does not fire when total is exactly at threshold (> not >=)', () => {
            const alerts = alertEngine.evaluate({
                sys,
                agents: [{ costs: { today: 5 } }],
            });
            expect(alerts.some(a => a.rule === 'cost_today_high')).toBe(false);
        });

        it('respects custom threshold via updateConfig', () => {
            alertEngine.updateConfig({ rules: { cost_today_high: { threshold: 20 } } });
            const below = alertEngine.evaluate({ sys, agents: [{ costs: { today: 10 } }] });
            expect(below.some(a => a.rule === 'cost_today_high')).toBe(false);
            const above = alertEngine.evaluate({ sys, agents: [{ costs: { today: 25 } }] });
            expect(above.some(a => a.rule === 'cost_today_high')).toBe(true);
        });
    });

    describe('fire() DB persistence', () => {
        afterEach(() => jest.restoreAllMocks());

        it('calls tsdbService.recordAlert when an alert fires', () => {
            const spy = jest.spyOn(tsdbService, 'recordAlert').mockReturnValue(true);
            alertEngine.evaluate({ sys: { cpu: 96, memory: 50, disk: 40 }, agents: [] });
            expect(spy).toHaveBeenCalledWith(expect.objectContaining({
                rule: 'cpu_critical',
                severity: 'critical',
            }));
        });

        it('does not propagate DB error when recordAlert throws', () => {
            jest.spyOn(tsdbService, 'recordAlert').mockImplementation(() => { throw new Error('db down'); });
            expect(() => {
                alertEngine.evaluate({ sys: { cpu: 96, memory: 50, disk: 40 }, agents: [] });
            }).not.toThrow();
        });
    });

    describe('observability alerts', () => {
        const sys = { cpu: 20, memory: 50, disk: 40 };
        const basePayload = { sys, agents: [] };

        afterEach(() => {
            jest.restoreAllMocks();
        });

        // Helper: create a mock error entry with timestamp
        function makeError(tsMs) {
            return {
                timestamp: tsMs,
                requestId: 'req-1',
                method: 'GET',
                path: '/api/test',
                statusCode: 500,
                error: 'Internal Server Error',
                durationMs: 100,
            };
        }

        describe('error_rate_high', () => {
            it('fires when recent errors within 5 minutes exceed threshold', () => {
                const now = Date.now();
                // 6 errors within the last 5 minutes (default threshold: 5)
                const recentErrors = Array.from({ length: 6 }, () => makeError(now - 60 * 1000));
                jest.spyOn(errorBuffer, 'getRecent').mockReturnValue(recentErrors);

                const alerts = alertEngine.evaluate(basePayload);
                const alert = alerts.find(a => a.rule === 'error_rate_high');
                expect(alert).toBeDefined();
                expect(alert.severity).toBe('warning');
                expect(alert.meta.count).toBe(6);
                expect(alert.meta.threshold).toBe(5);
            });

            it('does NOT fire when all errors are older than 5 minutes', () => {
                const now = Date.now();
                // Errors from 6 minutes ago — outside the 5-min window
                const oldErrors = Array.from({ length: 10 }, () => makeError(now - 6 * 60 * 1000));
                jest.spyOn(errorBuffer, 'getRecent').mockReturnValue(oldErrors);

                const alerts = alertEngine.evaluate(basePayload);
                expect(alerts.some(a => a.rule === 'error_rate_high')).toBe(false);
            });

            it('does NOT fire when error count is exactly at threshold (> not >=)', () => {
                const now = Date.now();
                // Exactly 5 errors — not > threshold
                const errors = Array.from({ length: 5 }, () => makeError(now - 60 * 1000));
                jest.spyOn(errorBuffer, 'getRecent').mockReturnValue(errors);

                const alerts = alertEngine.evaluate(basePayload);
                expect(alerts.some(a => a.rule === 'error_rate_high')).toBe(false);
            });

            it('accepts ISO string timestamps', () => {
                const now = Date.now();
                const isoTs = new Date(now - 60 * 1000).toISOString();
                const errors = Array.from({ length: 6 }, () => ({ ...makeError(0), timestamp: isoTs }));
                jest.spyOn(errorBuffer, 'getRecent').mockReturnValue(errors);

                const alerts = alertEngine.evaluate(basePayload);
                expect(alerts.some(a => a.rule === 'error_rate_high')).toBe(true);
            });

            it('does NOT re-fire while still above threshold (hysteresis latch)', () => {
                const now = Date.now();
                const recentErrors = Array.from({ length: 6 }, () => makeError(now - 60 * 1000));
                jest.spyOn(errorBuffer, 'getRecent').mockReturnValue(recentErrors);

                alertEngine.evaluate(basePayload); // first fire + latch=true
                const second = alertEngine.evaluate(basePayload); // still above — latch blocks
                expect(second.some(a => a.rule === 'error_rate_high')).toBe(false);
            });

            it('fires again after latch reset + cooldown expired (re-crossing)', () => {
                jest.useFakeTimers();
                jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));
                try {
                    // Use a dynamic mock that always returns errors within the current 5-min window
                    jest.spyOn(errorBuffer, 'getRecent').mockImplementation(() => {
                        const ts = Date.now() - 60 * 1000; // always 1 minute ago relative to current fake time
                        return Array.from({ length: 6 }, () => makeError(ts));
                    });
                    const noErrors = jest.spyOn(errorBuffer, 'getRecent')
                        .mockReturnValueOnce(Array.from({ length: 6 }, () => makeError(Date.now() - 60 * 1000))) // first: fire + latch
                        .mockReturnValueOnce([])           // second: below threshold → reset latch
                        .mockImplementation(() => {
                            const ts = Date.now() - 60 * 1000;
                            return Array.from({ length: 6 }, () => makeError(ts));
                        });

                    alertEngine.evaluate(basePayload); // fire #1 + latch=true
                    alertEngine.evaluate(basePayload); // drop → latch=false
                    jest.advanceTimersByTime(6 * 60 * 1000); // past 5min cooldown
                    const third = alertEngine.evaluate(basePayload);
                    expect(third.some(a => a.rule === 'error_rate_high')).toBe(true);
                } finally {
                    jest.useRealTimers();
                }
            });

            it('does not fire when disabled', () => {
                alertEngine.updateConfig({ rules: { error_rate_high: { enabled: false } } });
                const now = Date.now();
                const recentErrors = Array.from({ length: 20 }, () => makeError(now - 60 * 1000));
                jest.spyOn(errorBuffer, 'getRecent').mockReturnValue(recentErrors);

                const alerts = alertEngine.evaluate(basePayload);
                expect(alerts.some(a => a.rule === 'error_rate_high')).toBe(false);
            });
        });

        describe('latency_p99_high', () => {
            // Helper: build a stats object with one high-latency endpoint
            function makeStats(p99, count = 20) {
                return { 'GET /api/slow': { count, p50: 100, p95: 1800, p99, min: 50, max: p99, mean: 300, errorCount: { '4xx': 0, '5xx': 0 } } };
            }

            it('fires when an endpoint p99 exceeds threshold and count >= 10', () => {
                jest.spyOn(apiMetrics, 'getStats').mockReturnValue(makeStats(3000));

                const alerts = alertEngine.evaluate(basePayload);
                const alert = alerts.find(a => a.rule === 'latency_p99_high');
                expect(alert).toBeDefined();
                expect(alert.severity).toBe('warning');
                expect(alert.meta.endpoint).toBe('GET /api/slow');
                expect(alert.meta.p99).toBe(3000);
                expect(alert.meta.threshold).toBe(2000);
            });

            it('does NOT fire when count < 10 (low sample filter)', () => {
                jest.spyOn(apiMetrics, 'getStats').mockReturnValue(makeStats(5000, 9));

                const alerts = alertEngine.evaluate(basePayload);
                expect(alerts.some(a => a.rule === 'latency_p99_high')).toBe(false);
            });

            it('does NOT fire when p99 is exactly at threshold (> not >=)', () => {
                jest.spyOn(apiMetrics, 'getStats').mockReturnValue(makeStats(2000));

                const alerts = alertEngine.evaluate(basePayload);
                expect(alerts.some(a => a.rule === 'latency_p99_high')).toBe(false);
            });

            it('does NOT fire when stats is empty', () => {
                jest.spyOn(apiMetrics, 'getStats').mockReturnValue({});

                const alerts = alertEngine.evaluate(basePayload);
                expect(alerts.some(a => a.rule === 'latency_p99_high')).toBe(false);
            });

            it('picks the worst (highest p99) endpoint when multiple exceed threshold', () => {
                jest.spyOn(apiMetrics, 'getStats').mockReturnValue({
                    'GET /api/slow': { count: 20, p50: 100, p95: 2100, p99: 2500, min: 50, max: 2500, mean: 300, errorCount: { '4xx': 0, '5xx': 0 } },
                    'POST /api/worst': { count: 15, p50: 200, p95: 3500, p99: 4200, min: 80, max: 4200, mean: 500, errorCount: { '4xx': 0, '5xx': 0 } },
                });

                const alerts = alertEngine.evaluate(basePayload);
                const alert = alerts.find(a => a.rule === 'latency_p99_high');
                expect(alert).toBeDefined();
                expect(alert.meta.endpoint).toBe('POST /api/worst');
                expect(alert.meta.p99).toBe(4200);
            });

            it('does NOT re-fire while still above threshold (hysteresis latch)', () => {
                jest.spyOn(apiMetrics, 'getStats').mockReturnValue(makeStats(3000));

                alertEngine.evaluate(basePayload); // first fire + latch=true
                const second = alertEngine.evaluate(basePayload); // still above — latch blocks
                expect(second.some(a => a.rule === 'latency_p99_high')).toBe(false);
            });

            it('fires again after latch reset + cooldown expired (re-crossing)', () => {
                jest.useFakeTimers();
                jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));
                try {
                    const getStatsSpy = jest.spyOn(apiMetrics, 'getStats')
                        .mockReturnValueOnce(makeStats(3000))  // first: above threshold → fire + latch
                        .mockReturnValueOnce({})               // second: below threshold → reset latch
                        .mockReturnValue(makeStats(3000));     // subsequent: above threshold again

                    alertEngine.evaluate(basePayload); // fire #1 + latch=true
                    alertEngine.evaluate(basePayload); // drop → latch=false
                    jest.advanceTimersByTime(6 * 60 * 1000); // past 5min cooldown
                    const third = alertEngine.evaluate(basePayload);
                    expect(third.some(a => a.rule === 'latency_p99_high')).toBe(true);
                } finally {
                    jest.useRealTimers();
                }
            });

            it('does not fire when disabled', () => {
                alertEngine.updateConfig({ rules: { latency_p99_high: { enabled: false } } });
                jest.spyOn(apiMetrics, 'getStats').mockReturnValue(makeStats(9999));

                const alerts = alertEngine.evaluate(basePayload);
                expect(alerts.some(a => a.rule === 'latency_p99_high')).toBe(false);
            });
        });
    });
});
