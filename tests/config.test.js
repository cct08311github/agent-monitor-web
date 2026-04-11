'use strict';

const path = require('path');

describe('backend config', () => {
    const ENV_KEYS = [
        'PORT',
        'HTTPS_KEY_PATH',
        'HTTPS_CERT_PATH',
        'OPENCLAW_ROOT',
        'OPENCLAW_BIN',
        'OPENCLAW_ENV_PATH',
        'AUTH_USERNAME',
        'AUTH_PASSWORD_HASH',
        'AUTH_SESSION_SECRET',
        'AUTH_SESSION_TTL_HOURS',
        'HUD_CONTROL_TOKEN',
        'OPENCLAW_HUD_CONTROL_TOKEN',
        'AUTH_DISABLED',
        'GEMINI_API_KEY',
        'OPENCLAW_NOTIFY_CHANNEL',
        'OPENCLAW_NOTIFY_TARGET',
        'PROJECT_PATH',
        'PLANS_DIR',
    ];

    const savedEnv = {};

    beforeEach(() => {
        jest.resetModules();
        for (const key of ENV_KEYS) {
            savedEnv[key] = process.env[key];
            delete process.env[key];
        }
        // Set AUTH_DISABLED for tests that test fallback behavior
        process.env.AUTH_DISABLED = 'true';
    });

    afterEach(() => {
        for (const key of ENV_KEYS) {
            if (savedEnv[key] === undefined) delete process.env[key];
            else process.env[key] = savedEnv[key];
        }
    });

    it('returns default server and auth config values', () => {
        const config = require('../src/backend/config');
        const server = config.getServerConfig();
        const auth = config.getAuthConfig();

        expect(server.port).toBe(3001);
        expect(server.certKeyPath).toBe(path.join(config.getProjectRoot(), 'cert', 'key.pem'));
        expect(server.certCertPath).toBe(path.join(config.getProjectRoot(), 'cert', 'cert.pem'));
        expect(auth.username).toBe('admin');
        expect(auth.sessionTtlHours).toBe(8);
        expect(auth.sessionSecret).toBe('dev-secret-change-in-production');
        expect(auth.controlToken).toBe('');
    });

    it('reads overrides from environment', () => {
        process.env.PORT = '9443';
        process.env.AUTH_SESSION_SECRET = 'test-secret';
        process.env.AUTH_SESSION_TTL_HOURS = '12';
        process.env.HUD_CONTROL_TOKEN = 'secret-token';
        process.env.GEMINI_API_KEY = 'gemini-key';
        process.env.OPENCLAW_NOTIFY_CHANNEL = 'slack';
        process.env.OPENCLAW_NOTIFY_TARGET = 'ops-room';
        process.env.PROJECT_PATH = '/tmp/project';
        process.env.PLANS_DIR = '/tmp/project/docs/plans';

        const config = require('../src/backend/config');
        const server = config.getServerConfig();
        const auth = config.getAuthConfig();
        const optimize = config.getOptimizeConfig();

        expect(server.port).toBe(9443);
        expect(auth.sessionSecret).toBe('test-secret');
        expect(auth.sessionTtlHours).toBe(12);
        expect(auth.controlToken).toBe('secret-token');
        expect(optimize.geminiApiKey).toBe('gemini-key');
        expect(optimize.telegramChannel).toBe('slack');
        expect(optimize.telegramTarget).toBe('ops-room');
        expect(optimize.projectPath).toBe('/tmp/project');
        expect(optimize.plansDir).toBe('/tmp/project/docs/plans');
    });

    it('throws when AUTH_SESSION_SECRET missing in production mode', () => {
        // Ensure AUTH_DISABLED is NOT set (production mode)
        delete process.env.AUTH_DISABLED;
        delete process.env.AUTH_SESSION_SECRET;
        jest.resetModules();

        const config = require('../src/backend/config');
        expect(() => config.getAuthConfig()).toThrow('AUTH_SESSION_SECRET must be at least 32 characters');
    });
});
