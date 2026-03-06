'use strict';

const mockExecPromise = jest.fn();
const mockExecFilePromise = jest.fn();
const mockExecFile = jest.fn();
const mockSpawn = jest.fn();

jest.mock('util', () => ({
    promisify: jest.fn((fn) => {
        if (fn === require('child_process').exec) return mockExecPromise;
        return mockExecFilePromise;
    }),
}));

jest.mock('child_process', () => ({
    exec: jest.fn(),
    execFile: mockExecFile,
    spawn: mockSpawn,
}));

describe('openclawClient', () => {
    beforeEach(() => {
        jest.resetModules();
        mockExecPromise.mockReset();
        mockExecFilePromise.mockReset();
        mockExecFile.mockReset();
        mockSpawn.mockReset();
        process.env.OPENCLAW_BIN = '/tmp/custom-openclaw';
    });

    afterEach(() => {
        delete process.env.OPENCLAW_BIN;
    });

    it('normalizes openclaw shell commands to configured binary path', async () => {
        const client = require('../src/backend/services/openclawClient');
        mockExecPromise.mockResolvedValue({ stdout: 'ok', stderr: '' });
        await client.runCommand('openclaw agents list');
        expect(mockExecPromise).toHaveBeenCalledWith('/tmp/custom-openclaw agents list', {});
    });

    it('passes non-openclaw shell commands as-is', async () => {
        const client = require('../src/backend/services/openclawClient');
        mockExecPromise.mockResolvedValue({ stdout: 'ok', stderr: '' });
        await client.runCommand('echo hello');
        expect(mockExecPromise).toHaveBeenCalledWith('echo hello', {});
    });

    it('runs execFile against configured binary by default', async () => {
        const client = require('../src/backend/services/openclawClient');
        mockExecFilePromise.mockResolvedValue({ stdout: 'ok', stderr: '' });
        await client.runArgs(['status'], { timeout: 123 });
        expect(mockExecFilePromise).toHaveBeenCalledWith('/tmp/custom-openclaw', ['status'], { timeout: 123 });
    });

    it('supports overriding binPath for alternate executables', async () => {
        const client = require('../src/backend/services/openclawClient');
        mockExecFilePromise.mockResolvedValue({ stdout: 'ok', stderr: '' });
        await client.runArgs(['script.py'], { binPath: 'python3' });
        expect(mockExecFilePromise).toHaveBeenCalledWith('python3', ['script.py'], {});
    });

    it('spawns configured binary by default', () => {
        const client = require('../src/backend/services/openclawClient');
        const child = { unref: jest.fn() };
        mockSpawn.mockReturnValue(child);
        expect(client.spawnArgs(['logs'])).toBe(child);
        expect(mockSpawn).toHaveBeenCalledWith('/tmp/custom-openclaw', ['logs'], {});
    });
});
