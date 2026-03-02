const request = require('supertest');
const app = require('../src/backend/app');
const alertEngine = require('../src/backend/services/alertEngine');

describe('Alert API', () => {
    beforeEach(() => alertEngine.resetForTesting());

    it('GET /api/alerts/config returns config with rules', async () => {
        const res = await request(app).get('/api/alerts/config');
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.config.rules).toBeDefined();
        expect(res.body.config.rules.cpu_high).toBeDefined();
    });

    it('PATCH /api/alerts/config updates a threshold', async () => {
        const res = await request(app)
            .patch('/api/alerts/config')
            .send({ rules: { cpu_high: { threshold: 75 } } });
        expect(res.statusCode).toBe(200);
        expect(res.body.config.rules.cpu_high.threshold).toBe(75);
    });

    it('GET /api/alerts/recent returns array', async () => {
        const res = await request(app).get('/api/alerts/recent');
        expect(res.statusCode).toBe(200);
        expect(Array.isArray(res.body.alerts)).toBe(true);
    });
});
