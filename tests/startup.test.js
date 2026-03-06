'use strict';

const mockFs = {
    existsSync: jest.fn(),
    accessSync: jest.fn(),
    constants: { R_OK: 4 },
};

jest.mock('fs', () => mockFs);

describe('startup validation', () => {
    const ENV_KEYS = [
        'AUTH_DISABLED',
        'AUTH_PASSWORD_HASH',
        'HTTPS_KEY_PATH',
        'HTTPS_CERT_PATH',
        'OPENCLAW_BIN',
    ];
    const savedEnv = {};

    beforeEach(() => {
        jest.resetModules();
        for (const key of ENV_KEYS) {
            savedEnv[key] = process.env[key];
            delete process.env[key];
        }
        mockFs.existsSync.mockReset();
        mockFs.accessSync.mockReset();
        mockFs.existsSync.mockReturnValue(true);
    });

    afterEach(() => {
        for (const key of ENV_KEYS) {
            if (savedEnv[key] === undefined) delete process.env[key];
            else process.env[key] = savedEnv[key];
        }
    });

    it('passes when certs, binary, and auth config are present', () => {
        process.env.AUTH_PASSWORD_HASH = 'bcrypt-hash';
        const { validateStartup } = require('../src/backend/config/startup');
        expect(validateStartup()).toEqual({ ok: true, errors: [] });
    });

    it('fails when cert files are missing', () => {
        process.env.AUTH_PASSWORD_HASH = 'bcrypt-hash';
        mockFs.existsSync.mockImplementation((file) => !String(file).includes('/cert/'));
        const { validateStartup } = require('../src/backend/config/startup');
        const result = validateStartup();
        expect(result.ok).toBe(false);
        expect(result.errors.join('\n')).toContain('HTTPS key not found');
        expect(result.errors.join('\n')).toContain('HTTPS certificate not found');
    });

    it('fails when auth is enabled but password hash is missing', () => {
        const { validateStartup } = require('../src/backend/config/startup');
        const result = validateStartup();
        expect(result.ok).toBe(false);
        expect(result.errors).toContain('AUTH_PASSWORD_HASH is required when AUTH_DISABLED is false');
    });

    it('does not require auth password hash when auth is disabled', () => {
        process.env.AUTH_DISABLED = 'true';
        const { validateStartup } = require('../src/backend/config/startup');
        expect(validateStartup()).toEqual({ ok: true, errors: [] });
    });

    it('fails when OpenClaw binary path is unreadable', () => {
        process.env.AUTH_PASSWORD_HASH = 'bcrypt-hash';
        mockFs.accessSync.mockImplementation(() => {
            throw new Error('EACCES');
        });
        const { validateStartup } = require('../src/backend/config/startup');
        const result = validateStartup();
        expect(result.ok).toBe(false);
        expect(result.errors.join('\n')).toContain('OpenClaw binary is not readable');
    });
});
