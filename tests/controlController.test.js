// controlController tests
// All external process calls are mocked

const mockExecFilePromise = jest.fn();
const mockExecFile = jest.fn();
const mockReadFileSync = jest.fn();
const mockWriteFileSync = jest.fn();
const mockRenameSync = jest.fn();
const mockExistsSync = jest.fn().mockReturnValue(true);

jest.mock('util', () => ({
    promisify: jest.fn((fn) => {
        if (fn.name === 'execFile' || fn === require('child_process').execFile) return mockExecFilePromise;
        return jest.requireActual('util').promisify(fn);
    }),
}));

jest.mock('child_process', () => ({
    execFile: mockExecFile,
}));

jest.mock('fs', () => ({
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
    writeFileSync: mockWriteFileSync,
    renameSync: mockRenameSync,
}));

let ctrl;
beforeEach(() => {
    jest.resetModules();
    jest.mock('util', () => ({
        promisify: jest.fn(() => mockExecFilePromise),
    }));
    jest.mock('child_process', () => ({ execFile: mockExecFile }));
    jest.mock('fs', () => ({
        existsSync: mockExistsSync,
        readFileSync: mockReadFileSync,
        writeFileSync: mockWriteFileSync,
        renameSync: mockRenameSync,
    }));
    ctrl = require('../src/backend/controllers/controlController');
    mockExecFilePromise.mockReset();
    mockExecFile.mockReset();
    mockReadFileSync.mockReset();
    mockWriteFileSync.mockReset();
    mockRenameSync.mockReset();
    mockExistsSync.mockReturnValue(true);
});

function mockRes() {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
}

describe('runCommand', () => {
    it('returns 400 for missing command', async () => {
        const req = { body: {} };
        const res = mockRes();
        await ctrl.runCommand(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 400 for empty body', async () => {
        const req = { body: null };
        const res = mockRes();
        await ctrl.runCommand(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 403 for disallowed command', async () => {
        const req = { body: { command: 'rm -rf' } };
        const res = mockRes();
        await ctrl.runCommand(req, res);
        expect(res.status).toHaveBeenCalledWith(403);
    });

    it('handles talk command - success', async () => {
        mockExecFilePromise.mockResolvedValue({ stdout: 'hello response', stderr: '' });
        const req = { body: { command: 'talk', agentId: 'main', message: 'hello' } };
        const res = mockRes();
        await ctrl.runCommand(req, res);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('handles talk command - invalid agentId', async () => {
        const req = { body: { command: 'talk', agentId: 'bad agent!', message: 'hello' } };
        const res = mockRes();
        await ctrl.runCommand(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    it('handles talk command - missing message', async () => {
        const req = { body: { command: 'talk', agentId: 'main', message: '' } };
        const res = mockRes();
        await ctrl.runCommand(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    it('handles switch-model command - success', async () => {
        const config = {
            agents: {
                list: [{ id: 'main', model: { primary: 'gpt-4' } }]
            }
        };
        mockReadFileSync.mockReturnValue(JSON.stringify(config));
        const req = { body: { command: 'switch-model', agentId: 'main', model: 'gemini-3-flash' } };
        const res = mockRes();
        await ctrl.runCommand(req, res);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('handles switch-model command - agent not found', async () => {
        const config = { agents: { list: [{ id: 'other', model: { primary: 'gpt-4' } }] } };
        mockReadFileSync.mockReturnValue(JSON.stringify(config));
        const req = { body: { command: 'switch-model', agentId: 'nonexistent', model: 'gemini-3-flash' } };
        const res = mockRes();
        await ctrl.runCommand(req, res);
        expect(res.status).toHaveBeenCalledWith(404);
    });

    it('handles switch-model command - invalid agentId format', async () => {
        const req = { body: { command: 'switch-model', agentId: 'bad agent!', model: 'gpt-4' } };
        const res = mockRes();
        await ctrl.runCommand(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    it('handles switch-model command - invalid model format', async () => {
        const req = { body: { command: 'switch-model', agentId: 'main', model: 'bad model!' } };
        const res = mockRes();
        await ctrl.runCommand(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    it('handles switch-model command - config read error', async () => {
        mockReadFileSync.mockImplementation(() => { throw new Error('file not found'); });
        const req = { body: { command: 'switch-model', agentId: 'main', model: 'gemini-3-flash' } };
        const res = mockRes();
        await ctrl.runCommand(req, res);
        expect(res.status).toHaveBeenCalledWith(500);
    });

    it('handles restart command', async () => {
        jest.useFakeTimers();
        const req = { body: { command: 'restart' } };
        const res = mockRes();
        await ctrl.runCommand(req, res);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
        jest.runAllTimers();
        jest.useRealTimers();
    });

    it('handles restart with execFile error callback (line 82)', async () => {
        jest.useFakeTimers();
        // Make execFile call its callback with an error
        mockExecFile.mockImplementation((bin, args, cb) => {
            cb(new Error('restart subprocess error'));
        });
        const req = { body: { command: 'restart' } };
        const res = mockRes();
        await ctrl.runCommand(req, res);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
        // Run timers to trigger the setTimeout callback which calls execFile
        jest.runAllTimers();
        jest.useRealTimers();
    });

    it('handles update command', async () => {
        jest.useFakeTimers();
        const req = { body: { command: 'update' } };
        const res = mockRes();
        await ctrl.runCommand(req, res);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
        jest.runAllTimers();
        jest.useRealTimers();
    });

    it('handles notion_sync command', async () => {
        mockExecFilePromise.mockResolvedValue({ stdout: 'synced', stderr: '' });
        const req = { body: { command: 'notion_sync' } };
        const res = mockRes();
        await ctrl.runCommand(req, res);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('handles status command', async () => {
        mockExecFilePromise.mockResolvedValue({ stdout: 'status output', stderr: '' });
        const req = { body: { command: 'status' } };
        const res = mockRes();
        await ctrl.runCommand(req, res);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('handles models command', async () => {
        mockExecFilePromise.mockResolvedValue({ stdout: 'model output', stderr: '' });
        const req = { body: { command: 'models' } };
        const res = mockRes();
        await ctrl.runCommand(req, res);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('handles agents command', async () => {
        mockExecFilePromise.mockResolvedValue({ stdout: 'agents output', stderr: '' });
        const req = { body: { command: 'agents' } };
        const res = mockRes();
        await ctrl.runCommand(req, res);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('returns error for execFilePromise failure', async () => {
        mockExecFilePromise.mockRejectedValue(Object.assign(new Error('fail'), { stdout: '', stderr: 'err' }));
        const req = { body: { command: 'status' } };
        const res = mockRes();
        await ctrl.runCommand(req, res);
        expect(res.status).toHaveBeenCalledWith(500);
    });
});

describe('runLegacyCommand', () => {
    it('delegates to runCommand', async () => {
        const req = { body: {} };
        const res = mockRes();
        await ctrl.runLegacyCommand(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
    });
});
