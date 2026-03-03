// ComplianceSystem class tests
const ComplianceSystem = require('../src/backend/security/compliance_simple');

describe('ComplianceSystem', () => {
    let compliance;
    beforeEach(() => {
        compliance = new ComplianceSystem();
    });

    describe('analyze', () => {
        it('returns analysis with full pass', () => {
            const sys = {
                security: { inputValidation: true, threatDetection: true, protectionMeasures: true },
                monitoring: { logging: true }
            };
            const result = compliance.analyze(sys);
            expect(result.score).toBe('100.0');
            expect(result.level).toBe('優秀');
            expect(result.passed).toBe(4);
            expect(result.total).toBe(4);
        });

        it('returns partial pass', () => {
            const sys = {
                security: { inputValidation: true, threatDetection: false, protectionMeasures: false },
                monitoring: { logging: false }
            };
            const result = compliance.analyze(sys);
            expect(parseFloat(result.score)).toBe(25);
            expect(result.level).toBe('需要改進');
        });

        it('records history', () => {
            compliance.analyze({ security: {}, monitoring: {} });
            expect(compliance.history.length).toBe(1);
        });
    });

    describe('getLevel', () => {
        it('returns 優秀 for score >= 90', () => {
            expect(compliance.getLevel(90)).toBe('優秀');
            expect(compliance.getLevel(100)).toBe('優秀');
        });
        it('returns 良好 for score 75-89', () => {
            expect(compliance.getLevel(75)).toBe('良好');
            expect(compliance.getLevel(89)).toBe('良好');
        });
        it('returns 基本合規 for score 60-74', () => {
            expect(compliance.getLevel(60)).toBe('基本合規');
            expect(compliance.getLevel(74)).toBe('基本合規');
        });
        it('returns 需要改進 for score < 60', () => {
            expect(compliance.getLevel(0)).toBe('需要改進');
            expect(compliance.getLevel(59)).toBe('需要改進');
        });
    });

    describe('generateReport', () => {
        it('generates report with recommendations when score < 60', () => {
            const sys = { security: {}, monitoring: {} };
            const analysis = compliance.analyze(sys); // 0% → needs improvement
            const report = compliance.generateReport(analysis);
            expect(report.id).toMatch(/^COMP-/);
            expect(report.summary.score).toBeDefined();
            expect(report.recommendations.length).toBeGreaterThan(0);
        });

        it('generates report with no recommendations when score is 100', () => {
            const sys = {
                security: { inputValidation: true, threatDetection: true, protectionMeasures: true },
                monitoring: { logging: true }
            };
            const analysis = compliance.analyze(sys);
            const report = compliance.generateReport(analysis);
            expect(report.recommendations.length).toBe(0);
            expect(report.standards).toHaveProperty('OWASP');
            expect(report.standards).toHaveProperty('NIST');
        });
    });

    describe('getStatus', () => {
        it('returns status with standards and no history initially', () => {
            const status = compliance.getStatus();
            expect(status.standards).toContain('OWASP');
            expect(status.standards).toContain('NIST');
            expect(status.totalChecks).toBe(4);
            expect(status.history).toBe(0);
            expect(status.lastScore).toBeNull();
        });

        it('returns lastScore after analysis', () => {
            compliance.analyze({ security: { inputValidation: true, threatDetection: true, protectionMeasures: true }, monitoring: { logging: true } });
            const status = compliance.getStatus();
            expect(status.lastScore).toBe('100.0');
        });
    });
});
