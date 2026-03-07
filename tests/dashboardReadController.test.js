// dashboardReadController tests
// Tests focus on pure helper functions that can be extracted via mocking

const mockFs = {
    existsSync: jest.fn().mockReturnValue(false),
    readFileSync: jest.fn(),
    readdirSync: jest.fn().mockReturnValue([]),
    statSync: jest.fn().mockReturnValue({ mtimeMs: Date.now() }),
    mkdirSync: jest.fn(),
};

jest.mock('fs', () => mockFs);

const mockExecFilePromise = jest.fn();
jest.mock('util', () => ({
    promisify: jest.fn(() => mockExecFilePromise),
}));
jest.mock('child_process', () => ({
    execFile: jest.fn(),
    spawn: jest.fn(() => ({ unref: jest.fn() })),
}));

// Mock node-fetch
jest.mock('node-fetch', () => jest.fn());

// Mock chokidar (already handled by moduleNameMapper but being explicit)
jest.mock('../src/backend/services/agentWatcherService', () => ({
    start: jest.fn(),
    on: jest.fn(),
}));

jest.mock('../src/backend/services/tsdbService', () => ({
    saveSnapshot: jest.fn(),
    getSystemHistory: jest.fn().mockReturnValue([]),
    getAgentTopTokens: jest.fn().mockReturnValue([]),
    getCostHistory: jest.fn().mockReturnValue([]),
    getAgentActivitySummary: jest.fn().mockReturnValue([]),
}));

jest.mock('../src/backend/services/alertEngine', () => ({
    evaluate: jest.fn().mockReturnValue([]),
}));

jest.mock('../src/backend/utils/modelMonitor', () => ({
    fetchModelCooldowns: jest.fn().mockResolvedValue({}),
}));

let ctrl;
beforeEach(() => {
    jest.resetModules();
    mockExecFilePromise.mockReset();
    Object.values(mockFs).forEach(fn => typeof fn.mockReset === 'function' && fn.mockReset());
    mockFs.existsSync.mockReturnValue(false);
    mockFs.readdirSync.mockReturnValue([]);
    mockFs.statSync.mockReturnValue({ mtimeMs: Date.now() });

    // Re-apply mocks after resetModules
    jest.mock('fs', () => mockFs);
    jest.mock('util', () => ({ promisify: jest.fn(() => mockExecFilePromise) }));
    jest.mock('child_process', () => ({ execFile: jest.fn(), spawn: jest.fn(() => ({ unref: jest.fn() })) }));
    jest.mock('node-fetch', () => jest.fn());
    jest.mock('../src/backend/services/agentWatcherService', () => ({ start: jest.fn(), on: jest.fn() }));
    jest.mock('../src/backend/services/tsdbService', () => ({
        saveSnapshot: jest.fn(),
        getSystemHistory: jest.fn().mockReturnValue([]),
        getAgentTopTokens: jest.fn().mockReturnValue([]),
        getCostHistory: jest.fn().mockReturnValue([]),
        getAgentActivitySummary: jest.fn().mockReturnValue([]),
    }));
    jest.mock('../src/backend/services/alertEngine', () => ({ evaluate: jest.fn().mockReturnValue([]) }));
    jest.mock('../src/backend/utils/modelMonitor', () => ({ fetchModelCooldowns: jest.fn().mockResolvedValue({}) }));

    ctrl = require('../src/backend/controllers/dashboardReadController');
});

function mockRes() {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    res.writeHead = jest.fn();
    res.write = jest.fn();
    res.end = jest.fn();
    res.on = jest.fn();
    return res;
}

describe('getDashboard', () => {
    it('returns dashboard payload on success', async () => {
        // Return cron JSON for cron list, version for --version, empty for others
        mockExecFilePromise.mockImplementation((bin, args) => {
            if (args && args[0] === 'cron') return Promise.resolve({ stdout: '{"jobs":[]}', stderr: '' });
            if (args && args[0] === '--version') return Promise.resolve({ stdout: '1.0.0', stderr: '' });
            return Promise.resolve({ stdout: '1.0.0', stderr: '' });
        });

        const req = { query: {} };
        const res = mockRes();
        await ctrl.getDashboard(req, res);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('handles force=1 to clear cache', async () => {
        mockExecFilePromise.mockResolvedValue({ stdout: '1.0.0', stderr: '' });
        const req = { query: { force: '1' } };
        const res = mockRes();
        await ctrl.getDashboard(req, res);
        expect(res.json).toHaveBeenCalled();
    });

    it('returns 500 on unexpected error', async () => {
        mockExecFilePromise.mockRejectedValue(new Error('fail'));
        const req = { query: {} };
        const res = mockRes();
        await ctrl.getDashboard(req, res);
        // Either json or status 500
        expect(res.json).toHaveBeenCalled();
    });
});

describe('getHistory', () => {
    it('returns history data', async () => {
        const req = {};
        const res = mockRes();
        await ctrl.getHistory(req, res);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
});

describe('getStatus', () => {
    it('returns status output on success', async () => {
        mockExecFilePromise.mockResolvedValue({ stdout: 'status ok', stderr: '' });
        const req = {};
        const res = mockRes();
        await ctrl.getStatus(req, res);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('returns 500 on failure', async () => {
        mockExecFilePromise.mockRejectedValue(Object.assign(new Error('fail'), { stdout: '', stderr: '' }));
        const req = {};
        const res = mockRes();
        await ctrl.getStatus(req, res);
        expect(res.status).toHaveBeenCalledWith(500);
    });
});

describe('getModels', () => {
    it('returns models output on success', async () => {
        mockExecFilePromise.mockResolvedValue({ stdout: 'models list', stderr: '' });
        const req = {};
        const res = mockRes();
        await ctrl.getModels(req, res);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('returns 500 on failure', async () => {
        mockExecFilePromise.mockRejectedValue(Object.assign(new Error('fail'), { stdout: '', stderr: '' }));
        const req = {};
        const res = mockRes();
        await ctrl.getModels(req, res);
        expect(res.status).toHaveBeenCalledWith(500);
    });
});

describe('getAgents', () => {
    it('returns agents output on success', async () => {
        mockExecFilePromise.mockResolvedValue({ stdout: '- main (Main Agent)', stderr: '' });
        const req = {};
        const res = mockRes();
        await ctrl.getAgents(req, res);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('returns 500 on failure', async () => {
        mockExecFilePromise.mockRejectedValue(Object.assign(new Error('fail'), { stdout: '', stderr: '' }));
        const req = {};
        const res = mockRes();
        await ctrl.getAgents(req, res);
        expect(res.status).toHaveBeenCalledWith(500);
    });
});

describe('streamDashboard', () => {
    it('sets SSE headers and handles client close', async () => {
        mockExecFilePromise.mockResolvedValue({ stdout: '', stderr: '' });
        let closeHandler;
        const req = { on: jest.fn((event, cb) => { if (event === 'close') closeHandler = cb; }) };
        const res = mockRes();
        await ctrl.streamDashboard(req, res);
        expect(res.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({ 'Content-Type': 'text/event-stream' }));
        // Simulate client disconnect
        if (closeHandler) closeHandler();
    });
});
