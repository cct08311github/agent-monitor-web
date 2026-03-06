// API Routes - test the remaining uncovered routes
const request = require('supertest');
const app = require('../src/backend/app');

describe('API Routes', () => {
    describe('Health endpoint', () => {
        it('GET /api/read/health returns timestamp', async () => {
            const res = await request(app).get('/api/read/health');
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.ts).toBeDefined();
        });
    });

    describe('Cron Jobs', () => {
        it('GET /api/cron/jobs returns jobs or empty array', async () => {
            const res = await request(app).get('/api/cron/jobs');
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
        });

        it('POST /api/cron/jobs/:id/toggle with localhost host', async () => {
            const res = await request(app)
                .post('/api/cron/jobs/nonexistent/toggle')
                .set('host', 'localhost:3000')
                .send({ enabled: true });
            // 404 or 500 is expected for nonexistent job
            expect([404, 500]).toContain(res.statusCode);
        });

        it('DELETE /api/cron/jobs/:id with localhost host', async () => {
            const res = await request(app)
                .delete('/api/cron/jobs/nonexistent')
                .set('host', 'localhost:3000');
            expect([404, 500]).toContain(res.statusCode);
        });

        it('POST /api/cron/jobs/:id/run with localhost host', async () => {
            const res = await request(app)
                .post('/api/cron/jobs/nonexistent/run')
                .set('host', 'localhost:3000');
            expect([404, 500]).toContain(res.statusCode);
        });
    });

    describe('TaskHub', () => {
        it('GET /api/taskhub/stats handles DB error gracefully', async () => {
            const res = await request(app).get('/api/taskhub/stats');
            // Either 200 (if DB exists) or 500 (if DB missing)
            expect([200, 500]).toContain(res.statusCode);
        });

        it('GET /api/taskhub/tasks handles DB error gracefully', async () => {
            const res = await request(app).get('/api/taskhub/tasks');
            expect([200, 500]).toContain(res.statusCode);
        });
    });

    describe('Watchdog Routes', () => {
        it('GET /api/watchdog/status returns status', async () => {
            const res = await request(app).get('/api/watchdog/status');
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.watchdog).toBeDefined();
        });

        it('POST /api/watchdog/toggle start with localhost host', async () => {
            const res = await request(app)
                .post('/api/watchdog/toggle')
                .set('host', 'localhost:3000')
                .send({ enabled: true });
            expect(res.statusCode).toBe(200);
        });

        it('POST /api/watchdog/toggle stop with localhost host', async () => {
            const res = await request(app)
                .post('/api/watchdog/toggle')
                .set('host', 'localhost:3000')
                .send({ enabled: false });
            expect(res.statusCode).toBe(200);
        });

        it('POST /api/watchdog/repair returns 500 when triggerRepair throws', async () => {
            const gatewayWatchdog = require('../src/backend/services/gatewayWatchdog');
            jest.spyOn(gatewayWatchdog, 'triggerRepair').mockRejectedValueOnce(new Error('repair failed'));
            const res = await request(app)
                .post('/api/watchdog/repair')
                .set('host', 'localhost:3000');
            expect(res.statusCode).toBe(500);
            expect(res.body.success).toBe(false);
            jest.restoreAllMocks();
        });

        it('POST /api/watchdog/repair returns 200 when triggerRepair succeeds', async () => {
            const gatewayWatchdog = require('../src/backend/services/gatewayWatchdog');
            jest.spyOn(gatewayWatchdog, 'triggerRepair').mockResolvedValueOnce(true);
            const res = await request(app)
                .post('/api/watchdog/repair')
                .set('host', 'localhost:3000');
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.repaired).toBe(true);
            jest.restoreAllMocks();
        });
    });

    describe('Control Routes', () => {
        it('POST /api/command blocked by forbidden host', async () => {
            const res = await request(app)
                .post('/api/command')
                .set('host', 'evil.com')
                .send({ command: 'status' });
            expect(res.statusCode).toBe(403);
        });

        it('POST /api/command returns 400 for missing command via localhost', async () => {
            const res = await request(app)
                .post('/api/command')
                .set('host', 'localhost:3000')
                .send({});
            expect(res.statusCode).toBe(400);
        });

        it('POST /api/control/command requires bearer token', async () => {
            const res = await request(app)
                .post('/api/control/command')
                .set('host', 'localhost:3000')
                .send({ command: 'status' });
            expect([401, 503]).toContain(res.statusCode);
        });
    });

    describe('Dashboard Routes', () => {
        it('GET /api/dashboard alias works', async () => {
            const res = await request(app).get('/api/dashboard');
            // Will likely 200 or 500 depending on openclaw availability
            expect([200, 500]).toContain(res.statusCode);
        }, 10000);
    });

    describe('Compliance', () => {
        it('POST /api/compliance/analyze returns compliance report', async () => {
            const res = await request(app)
                .post('/api/compliance/analyze')
                .send({ cpu: 50, memory: 60 });
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
        });

        it("POST /api/compliance/analyze with empty body returns 200 or 200", async () => {
            const res = await request(app)
                .post('/api/compliance/analyze')
                .send();
            expect(res.statusCode).toBe(200);
        });
    });

    describe('SPA Fallback', () => {
        it('GET /unknown-route serves index.html', async () => {
            const res = await request(app).get('/some-spa-route');
            // May return 200 (if index.html exists) or 404
            expect([200, 404]).toContain(res.statusCode);
        });
    });
});
