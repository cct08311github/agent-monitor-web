const request = require('supertest');
const app = require('../src/backend/app');
const alertEngine = require('../src/backend/services/alertEngine');
const tsdbService = require('../src/backend/services/tsdbService');

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

    it('PATCH /api/alerts/config returns 400 when updateConfig throws', async () => {
        // Mock alertEngine.updateConfig to throw an error
        const origUpdateConfig = alertEngine.updateConfig;
        alertEngine.updateConfig = jest.fn().mockImplementationOnce(() => {
            throw new Error('entries failed');
        });
        const res = await request(app)
            .patch('/api/alerts/config')
            .send({ rules: { cpu_high: { threshold: 99 } } });
        expect(res.statusCode).toBe(400);
        expect(res.body.success).toBe(false);
        alertEngine.updateConfig = origUpdateConfig;
    });

    describe('GET /api/alerts/history', () => {
        afterEach(() => jest.restoreAllMocks());

        it('returns history with default parameters', async () => {
            jest.spyOn(tsdbService, 'getAlertHistory').mockReturnValue([
                { ts: 1000, rule: 'cpu_high', severity: 'warning', message: 'msg', meta: null },
            ]);
            const res = await request(app).get('/api/alerts/history');
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
            expect(Array.isArray(res.body.alerts)).toBe(true);
            expect(res.body.total).toBe(1);
        });

        it('respects limit query param', async () => {
            jest.spyOn(tsdbService, 'getAlertHistory').mockImplementation(({ limit }) => {
                return Array.from({ length: limit }, (_, i) => ({
                    ts: i + 1000, rule: 'cpu_high', severity: 'warning', message: `m${i}`, meta: null,
                }));
            });
            const res = await request(app).get('/api/alerts/history?limit=5');
            expect(res.statusCode).toBe(200);
            expect(res.body.alerts.length).toBe(5);
        });

        it('caps limit to 500 when limit=10000 is provided', async () => {
            let capturedLimit;
            jest.spyOn(tsdbService, 'getAlertHistory').mockImplementation(({ limit }) => {
                capturedLimit = limit;
                return [];
            });
            const res = await request(app).get('/api/alerts/history?limit=10000');
            expect(res.statusCode).toBe(200);
            // controller caps at 500 before calling tsdbService
            expect(capturedLimit).toBeLessThanOrEqual(500);
        });

        it('passes from/to filter parameters to tsdbService', async () => {
            let capturedOpts;
            jest.spyOn(tsdbService, 'getAlertHistory').mockImplementation((opts) => {
                capturedOpts = opts;
                return [];
            });
            const res = await request(app).get('/api/alerts/history?from=1000&to=9000');
            expect(res.statusCode).toBe(200);
            expect(capturedOpts.from).toBe(1000);
            expect(capturedOpts.to).toBe(9000);
        });

        it('returns 500 when tsdbService.getAlertHistory throws', async () => {
            jest.spyOn(tsdbService, 'getAlertHistory').mockImplementation(() => {
                throw new Error('db crash');
            });
            const res = await request(app).get('/api/alerts/history');
            expect(res.statusCode).toBe(500);
            expect(res.body.success).toBe(false);
        });
    });
});
