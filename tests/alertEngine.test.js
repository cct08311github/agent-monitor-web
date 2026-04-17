const alertEngine = require('../src/backend/services/alertEngine');

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
});
