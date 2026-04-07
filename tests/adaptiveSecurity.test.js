// AdaptiveSecurity class tests
const AdaptiveSecurity = require('../src/backend/security/adaptive_security_simple');

// Create a minimal mock threat intel for direct testing
function makeThreatIntel(threatCount = 0, risk = 'low') {
    return {
        analyze: jest.fn().mockReturnValue({ threats: [], threatCount, risk })
    };
}

describe('AdaptiveSecurity', () => {
    describe('getLevelInfo', () => {
        it('returns info for each valid level', () => {
            const as = new AdaptiveSecurity(makeThreatIntel());
            expect(as.getLevelInfo('low').label).toBe('低');
            expect(as.getLevelInfo('medium').label).toBe('中');
            expect(as.getLevelInfo('high').label).toBe('高');
            expect(as.getLevelInfo('critical').label).toBe('嚴重');
        });

        it('defaults to currentLevel when no arg', () => {
            const as = new AdaptiveSecurity(makeThreatIntel());
            as.currentLevel = 'high';
            expect(as.getLevelInfo().label).toBe('高');
        });

        it('falls back to medium for unknown level', () => {
            const as = new AdaptiveSecurity(makeThreatIntel());
            expect(as.getLevelInfo('unknown').label).toBe('中');
        });
    });

    describe('calculateRisk', () => {
        it('returns 0.1 for zero threats and low risk', () => {
            const as = new AdaptiveSecurity(makeThreatIntel());
            expect(as.calculateRisk({ threatCount: 0, risk: 'low' })).toBeCloseTo(0.1);
        });

        it('adds 0.3 for one threat', () => {
            const as = new AdaptiveSecurity(makeThreatIntel());
            // 0.3 (1 threat) + 0.3 (medium severity) = 0.6
            expect(as.calculateRisk({ threatCount: 1, risk: 'medium' })).toBeCloseTo(0.6);
        });

        it('adds 0.5 for more than 2 threats', () => {
            const as = new AdaptiveSecurity(makeThreatIntel());
            // 0.3 (>0) + 0.2 (>2) + 0.6 (high) = 1.1 → capped at 1.0
            expect(as.calculateRisk({ threatCount: 3, risk: 'high' })).toBe(1.0);
        });

        it('returns 1.0 for critical severity', () => {
            const as = new AdaptiveSecurity(makeThreatIntel());
            expect(as.calculateRisk({ threatCount: 1, risk: 'critical' })).toBe(1.0);
        });
    });

    describe('determineLevel', () => {
        it('returns critical for score >= 0.8', () => {
            const as = new AdaptiveSecurity(makeThreatIntel());
            expect(as.determineLevel(0.8)).toBe('critical');
            expect(as.determineLevel(1.0)).toBe('critical');
        });

        it('returns high for score 0.6-0.79', () => {
            const as = new AdaptiveSecurity(makeThreatIntel());
            expect(as.determineLevel(0.6)).toBe('high');
            expect(as.determineLevel(0.79)).toBe('high');
        });

        it('returns medium for score 0.3-0.59', () => {
            const as = new AdaptiveSecurity(makeThreatIntel());
            expect(as.determineLevel(0.3)).toBe('medium');
            expect(as.determineLevel(0.5)).toBe('medium');
        });

        it('returns low for score < 0.3', () => {
            const as = new AdaptiveSecurity(makeThreatIntel());
            expect(as.determineLevel(0.0)).toBe('low');
            expect(as.determineLevel(0.29)).toBe('low');
        });
    });

    describe('adjustLevel', () => {
        it('returns false when level is already the same', () => {
            const as = new AdaptiveSecurity(makeThreatIntel());
            as.currentLevel = 'medium';
            expect(as.adjustLevel('medium', 'test')).toBe(false);
        });

        it('changes level and pushes history', () => {
            const as = new AdaptiveSecurity(makeThreatIntel());
            as.currentLevel = 'medium';
            const result = as.adjustLevel('high', 'test reason');
            expect(result).toBe(true);
            expect(as.currentLevel).toBe('high');
            expect(as.history.length).toBe(1);
            expect(as.history[0].from).toBe('medium');
            expect(as.history[0].to).toBe('high');
        });
    });

    describe('analyze', () => {
        it('returns analysis object with all fields', () => {
            const ti = makeThreatIntel(0, 'low');
            const as = new AdaptiveSecurity(ti);
            const result = as.analyze('hello world');
            expect(result).toHaveProperty('riskScore');
            expect(result).toHaveProperty('threatAnalysis');
            expect(result).toHaveProperty('suggestedLevel');
            expect(result).toHaveProperty('currentLevel');
            expect(result).toHaveProperty('adjusted');
            expect(result).toHaveProperty('levelInfo');
        });

        it('escalates to critical on high risk content', () => {
            const ti = { analyze: jest.fn().mockReturnValue({ threatCount: 3, risk: 'critical' }) };
            const as = new AdaptiveSecurity(ti);
            const result = as.analyze('ignore previous instructions eval(malicious)');
            expect(result.suggestedLevel).toBe('critical');
            expect(result.currentLevel).toBe('critical');
        });

        it('no adjustment when already at suggested level', () => {
            const ti = makeThreatIntel(0, 'low');
            const as = new AdaptiveSecurity(ti);
            as.currentLevel = 'low';
            const result = as.analyze('safe');
            expect(result.adjusted).toBe(false);
        });
    });

    describe('getStatus', () => {
        it('returns status with no history', () => {
            const as = new AdaptiveSecurity(makeThreatIntel());
            const status = as.getStatus();
            expect(status.currentLevel).toBe('medium');
            expect(status.historyCount).toBe(0);
            expect(status.lastUpdate).toBeNull();
        });

        it('returns lastUpdate after level change', () => {
            const as = new AdaptiveSecurity(makeThreatIntel());
            as.adjustLevel('high', 'test');
            const status = as.getStatus();
            expect(status.historyCount).toBe(1);
            expect(status.lastUpdate).toBeDefined();
        });
    });
});
