const request = require('supertest');
const app = require('../src/backend/app');

describe('ComplianceController API', () => {
    describe('POST /api/compliance/analyze', () => {
        it('returns compliance report for valid system data', async () => {
            const res = await request(app)
                .post('/api/compliance/analyze')
                .send({
                    security: { inputValidation: true, threatDetection: true, protectionMeasures: true },
                    monitoring: { logging: true },
                });
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body).toHaveProperty('id');
            expect(res.body).toHaveProperty('summary');
            expect(res.body).toHaveProperty('standards');
            expect(res.body.summary.score).toBe('100.0');
        });

        it('returns compliance report with enhanced security data', async () => {
            // Controller enhances input with security defaults before analysis
            const res = await request(app)
                .post('/api/compliance/analyze')
                .send({
                    monitoring: { logging: false },
                });
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body).toHaveProperty('summary');
            expect(res.body).toHaveProperty('recommendations');
        });

        it('returns compliance report for empty body', async () => {
            const res = await request(app)
                .post('/api/compliance/analyze')
                .send({});
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
        });
    });

    describe('GET /api/compliance/status', () => {
        it('returns compliance status with standards', async () => {
            const res = await request(app).get('/api/compliance/status');
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body).toHaveProperty('standards');
            expect(res.body.standards).toContain('OWASP');
            expect(res.body.standards).toContain('NIST');
            expect(res.body).toHaveProperty('totalChecks');
        });
    });
});
