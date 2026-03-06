const healthService = require('../src/backend/services/healthService');

describe('healthService', () => {
    afterEach(() => {
        jest.restoreAllMocks();
        delete process.env.HTTPS_KEY_PATH;
        delete process.env.HTTPS_CERT_PATH;
        delete process.env.OPENCLAW_BIN;
        delete process.env.TASKHUB_DB_PATH;
        delete process.env.AUTH_DISABLED;
        delete process.env.AUTH_PASSWORD_HASH;
    });

    it('returns alive payload for liveness', () => {
        const payload = healthService.getLivenessPayload();
        expect(payload.status).toBe('alive');
        expect(payload.pid).toBe(process.pid);
        expect(typeof payload.uptimeSec).toBe('number');
    });

    it('marks readiness not_ready when startup validation fails', () => {
        process.env.HTTPS_KEY_PATH = '/tmp/missing-key.pem';
        process.env.HTTPS_CERT_PATH = '/tmp/missing-cert.pem';
        process.env.OPENCLAW_BIN = '/tmp/missing-openclaw';
        process.env.AUTH_PASSWORD_HASH = 'hash';

        const payload = healthService.getReadinessPayload();
        expect(payload.ready).toBe(false);
        expect(payload.status).toBe('not_ready');
        expect(payload.startup.ok).toBe(false);
    });

    it('reports optional dependencies as degraded or missing without breaking liveness payload', () => {
        process.env.TASKHUB_DB_PATH = '/tmp/missing-taskhub.db';
        process.env.AUTH_DISABLED = 'true';

        const dependencies = healthService.getDependencyHealth();
        expect(dependencies.taskHubDb.status).toBe('degraded');
        expect(dependencies.auth.status).toBe('ready');
    });
});
