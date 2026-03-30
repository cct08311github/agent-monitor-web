'use strict';

const request = require('supertest');
const app = require('../src/backend/app');

describe('Plugin Registry API', () => {
    describe('GET /api/plugins', () => {
        it('returns plugin registry statistics', async () => {
            const res = await request(app)
                .get('/api/plugins')
                .set('host', 'localhost:3000')
                .expect(200);

            expect(res.body.success).toBe(true);
            expect(res.body).toHaveProperty('total');
            expect(res.body).toHaveProperty('enabled');
            expect(res.body).toHaveProperty('disabled');
            expect(res.body).toHaveProperty('plugins');
            expect(Array.isArray(res.body.plugins)).toBe(true);
        });
    });

    describe('POST /api/plugins/:name/toggle', () => {
        it('returns 404 for non-existent plugin', async () => {
            const res = await request(app)
                .post('/api/plugins/non-existent-plugin/toggle')
                .set('host', 'localhost:3000')
                .expect(404);

            expect(res.body.success).toBe(false);
            expect(res.body.error).toBe('plugin_not_found');
        });
    });
});

describe('Feature Flags API', () => {
    describe('GET /api/flags', () => {
        it('returns all feature flags', async () => {
            const res = await request(app)
                .get('/api/flags')
                .set('host', 'localhost:3000')
                .expect(200);

            expect(res.body.success).toBe(true);
            expect(res.body).toHaveProperty('total');
            expect(res.body).toHaveProperty('enabled');
            expect(res.body).toHaveProperty('disabled');
            expect(res.body).toHaveProperty('flags');
            expect(Array.isArray(res.body.flags)).toBe(true);

            // Check known flags exist
            const flagNames = res.body.flags.map(f => f.name);
            expect(flagNames).toContain('dashboard');
            expect(flagNames).toContain('alerts');
            expect(flagNames).toContain('sseStream');
        });
    });

    describe('PATCH /api/flags/:name', () => {
        it('returns 404 for unknown flag', async () => {
            const res = await request(app)
                .patch('/api/flags/unknown-flag')
                .set('host', 'localhost:3000')
                .send({ enabled: true })
                .expect(404);

            expect(res.body.success).toBe(false);
            expect(res.body.error).toBe('flag_not_found');
        });

        it('returns 400 when enabled is not boolean', async () => {
            const res = await request(app)
                .patch('/api/flags/dashboard')
                .set('host', 'localhost:3000')
                .send({ enabled: 'yes' })
                .expect(400);

            expect(res.body.success).toBe(false);
            expect(res.body.error).toBe('invalid_flag_update');
        });
    });
});
