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

    it('GET /api/read/liveness should return alive status', async () => {
        const res = await request(app).get('/api/read/liveness');
        expect(res.statusCode).toEqual(200);
        expect(res.body).toHaveProperty('success', true);
        expect(res.body).toHaveProperty('status', 'alive');
        expect(res.body).toHaveProperty('pid');
        expect(res.body).toHaveProperty('uptimeSec');
    });

    it('GET /api/read/readiness should return readiness payload', async () => {
        const res = await request(app).get('/api/read/readiness');
        expect([200, 503]).toContain(res.statusCode);
        expect(res.body).toHaveProperty('success', true);
        expect(res.body).toHaveProperty('ready');
        expect(res.body).toHaveProperty('startup');
        expect(res.body).toHaveProperty('dependencies');
    });

    it('GET /api/read/dependencies should return dependency health', async () => {
        const res = await request(app).get('/api/read/dependencies');
        expect([200, 503]).toContain(res.statusCode);
        expect(res.body).toHaveProperty('success', true);
        expect(res.body).toHaveProperty('dependencies');
    });

    it('GET /api/read/health should return ok', async () => {
        const res = await request(app).get('/api/read/health');
        expect(res.statusCode).toEqual(200);
        expect(res.body).toHaveProperty('success', true);
        expect(res.body).toHaveProperty('ts');
    });
});
