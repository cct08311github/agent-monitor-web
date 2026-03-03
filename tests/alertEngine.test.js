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
});
