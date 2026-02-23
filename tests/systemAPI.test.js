const request = require('supertest');
const app = require('../src/backend/app');

describe('System Health & Summary APIs', () => {
    it('GET /api/health should return healthy status', async () => {
        const res = await request(app).get('/api/health');
        expect(res.statusCode).toEqual(200);
        expect(res.body).toHaveProperty('success', true);
        expect(res.body).toHaveProperty('status', 'healthy');
        expect(res.body).toHaveProperty('features');
        expect(res.body).toHaveProperty('version');
    });

    it('GET /api/system/comprehensive should return full system metrics', async () => {
        const res = await request(app).get('/api/system/comprehensive');
        expect(res.statusCode).toEqual(200);
        expect(res.body).toHaveProperty('success', true);
        expect(res.body).toHaveProperty('components');
        expect(res.body).toHaveProperty('summary');
        expect(res.body.components).toHaveProperty('monitoring');
        expect(res.body.components).toHaveProperty('security');
        expect(res.body.components).toHaveProperty('compliance');
    });
});
