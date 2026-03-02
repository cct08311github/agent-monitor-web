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

    it('respects cooldown: same rule does not fire twice within 5 minutes', () => {
        alertEngine.evaluate({ sys: { cpu: 96, memory: 50, disk: 40 }, agents: [] });
        const second = alertEngine.evaluate({ sys: { cpu: 97, memory: 50, disk: 40 }, agents: [] });
        expect(second.some(a => a.rule === 'cpu_critical')).toBe(false);
    });

    it('getRecent returns last N alerts', () => {
        alertEngine.evaluate({ sys: { cpu: 85, memory: 50, disk: 40 }, agents: [] });
        expect(alertEngine.getRecent(10).length).toBeGreaterThan(0);
    });
});
