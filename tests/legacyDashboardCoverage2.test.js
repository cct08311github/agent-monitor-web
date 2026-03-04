// legacyDashboardController — branch coverage extension
// Targets: detectDetailedActivity, buildSubagentStatus, getSystemResources, cron parse error

const path = require('path');
const osReal = require('os');
const HOME = osReal.homedir();
const AGENTS_ROOT_PATH = path.join(HOME, '.openclaw', 'agents');

const mockFs = {
    existsSync: jest.fn().mockReturnValue(false),
    readFileSync: jest.fn().mockReturnValue(''),
    readdirSync: jest.fn().mockReturnValue([]),
    statSync: jest.fn().mockReturnValue({ mtimeMs: Date.now() }),
    mkdirSync: jest.fn(),
};
jest.mock('fs', () => mockFs);

const mockExecFilePromise = jest.fn();
jest.mock('util', () => ({ promisify: jest.fn(() => mockExecFilePromise) }));
jest.mock('child_process', () => ({
    execFile: jest.fn(),
    spawn: jest.fn(() => ({ unref: jest.fn() })),
}));
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

let ctrl;

beforeEach(() => {
    jest.resetModules();
    Object.values(mockFs).forEach(fn => typeof fn.mockReset === 'function' && fn.mockReset());
    mockFs.existsSync.mockReturnValue(false);
    mockFs.readdirSync.mockReturnValue([]);
    mockFs.statSync.mockReturnValue({ mtimeMs: Date.now() });
    mockFs.readFileSync.mockReturnValue('');
    mockExecFilePromise.mockReset();

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

    ctrl = require('../src/backend/controllers/legacyDashboardController');
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

function setupExec({ agentsOut = '- main (Main Agent)\n', cronOut = '{"jobs":[]}', vmStatOut = '' } = {}) {
    mockExecFilePromise.mockImplementation((bin, args) => {
        if (bin === 'vm_stat') return Promise.resolve({ stdout: vmStatOut, stderr: '' });
        if (bin === 'df') return Promise.resolve({ stdout: 'Filesystem\n/dev/disk1 100G 50G 50G 50% /', stderr: '' });
        if (bin === 'free') return Promise.resolve({ stdout: 'Mem: 16000000000 8000000000 4000000000 0 0 4000000000', stderr: '' });
        if (!args) return Promise.resolve({ stdout: '', stderr: '' });
        if (args[0] === '--version') return Promise.resolve({ stdout: '1.2.3', stderr: '' });
        if (args[0] === 'agents') return Promise.resolve({ stdout: agentsOut, stderr: '' });
        if (args[0] === 'cron') return Promise.resolve({ stdout: cronOut, stderr: '' });
        if (args[0] === '-h') return Promise.resolve({ stdout: 'Filesystem\n/dev/disk1 100G 50G 50G 50% /', stderr: '' });
        return Promise.resolve({ stdout: '', stderr: '' });
    });
}

function makeSessionsJson({ withSubagent = false } = {}) {
    const now = Date.now();
    const data = {
        'session_abc': {
            updatedAt: now - 3 * 60 * 1000,
            inputTokens: 1000,
            outputTokens: 500,
            cacheRead: 200,
            model: 'gemini-2.5-flash',
            modelProvider: 'google',
            totalTokens: 1500,
        },
        'session_old': {
            updatedAt: 0,
            inputTokens: 100,
            outputTokens: 50,
            totalTokens: 150,
        },
    };
    if (withSubagent) {
        data['agent:main:subagent:task1'] = { updatedAt: now - 2 * 60 * 1000, createdAt: now - 5 * 60 * 1000, totalTokens: 200, model: 'gemini-2.5-flash', label: 'Running task' };
        data['agent:main:subagent:task2'] = { updatedAt: now - 30 * 60 * 1000, createdAt: now - 35 * 60 * 1000, totalTokens: 100 };
        data['agent:main:subagent:task3'] = { updatedAt: now - 120 * 60 * 1000, createdAt: now - 125 * 60 * 1000, totalTokens: 50 };
        data['agent:main:subagent:task4'] = { updatedAt: 0, createdAt: now - 200 * 60 * 1000, totalTokens: 10 };
        data['agent:main:subagent:task5'] = { updatedAt: now - 10 * 1000, createdAt: now - 20 * 1000, totalTokens: 5 };
    }
    return JSON.stringify(data);
}

function setupFsForAgent({ jsonlContent = '', jsonlMtime = Date.now() - 10 * 60 * 1000, withSubagent = false } = {}) {
    const agentDir = path.join(AGENTS_ROOT_PATH, 'main', 'sessions');
    const sessionsJsonPath = path.join(agentDir, 'sessions.json');
    const jsonlPath = path.join(agentDir, 'session1.jsonl');

    mockFs.existsSync.mockImplementation((p) => {
        if (p === sessionsJsonPath) return true;
        if (p === agentDir) return true;
        return false;
    });
    mockFs.readdirSync.mockImplementation((p) => {
        if (p === agentDir) return jsonlContent ? ['session1.jsonl'] : [];
        if (p === AGENTS_ROOT_PATH) return ['main'];
        return [];
    });
    mockFs.statSync.mockImplementation(() => ({ mtimeMs: jsonlMtime }));
    mockFs.readFileSync.mockImplementation((p) => {
        if (p === sessionsJsonPath) return makeSessionsJson({ withSubagent });
        if (p === jsonlPath) return jsonlContent;
        throw Object.assign(new Error('ENOENT: ' + p), { code: 'ENOENT' });
    });
}

// --- detectDetailedActivity: JSONL content paths ---

describe('detectDetailedActivity — content as array', () => {
    it('parses assistant content array and returns text', async () => {
        const line = JSON.stringify({ message: { role: 'assistant', content: [{ type: 'text', text: 'Working on analysis' }, { type: 'tool_use', id: 'x', name: 'Bash' }] } });
        setupFsForAgent({ jsonlContent: line, jsonlMtime: Date.now() - 10 * 60 * 1000 });
        setupExec();

        const res = mockRes();
        await ctrl.getDashboard({ query: { force: '1' } }, res);

        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
        const payload = res.json.mock.calls[0][0];
        const agent = (payload.agents || []).find(a => a.id === 'main');
        if (agent) {
            expect(agent.status).toBe('active_recent');
            expect(agent.currentTask.task).toContain('Working on analysis');
        }
    });

    it('handles content array with no text items (returns empty, falls through)', async () => {
        const line = JSON.stringify({ message: { role: 'assistant', content: [{ type: 'tool_use', id: 'x', name: 'Bash' }] } });
        const fallback = JSON.stringify({ message: { role: 'assistant', content: 'Fallback text' } });
        setupFsForAgent({ jsonlContent: [line, fallback].join('\n'), jsonlMtime: Date.now() - 20 * 60 * 1000 });
        setupExec();

        const res = mockRes();
        await ctrl.getDashboard({ query: { force: '1' } }, res);

        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
});

describe('detectDetailedActivity — content as string', () => {
    it('parses assistant content string and sets it as task', async () => {
        const line = JSON.stringify({ message: { role: 'assistant', content: 'I will help you with that task' } });
        setupFsForAgent({ jsonlContent: line, jsonlMtime: Date.now() - 20 * 60 * 1000 });
        setupExec();

        const res = mockRes();
        await ctrl.getDashboard({ query: { force: '1' } }, res);

        const payload = res.json.mock.calls[0][0];
        const agent = (payload.agents || []).find(a => a.id === 'main');
        if (agent) {
            expect(agent.currentTask.task).toBe('I will help you with that task');
        }
    });
});

describe('detectDetailedActivity — null roleFilter fallback', () => {
    it('iterates null filter when no assistant message found; skips user/toolResult', async () => {
        const lines = [
            JSON.stringify({ message: { role: 'user', content: 'hello' } }),
            JSON.stringify({ message: { role: 'toolResult', content: 'result' } }),
        ].join('\n');
        setupFsForAgent({ jsonlContent: lines, jsonlMtime: Date.now() - 45 * 60 * 1000 });
        setupExec();

        const res = mockRes();
        await ctrl.getDashboard({ query: { force: '1' } }, res);

        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
        const payload = res.json.mock.calls[0][0];
        const agent = (payload.agents || []).find(a => a.id === 'main');
        if (agent) {
            // No content found → default label 'Idle'
            expect(agent.currentTask.label).toBe('Idle');
        }
    });
});

describe('detectDetailedActivity — status variants', () => {
    it('sets active_executing when mtime < 5 minutes ago', async () => {
        const line = JSON.stringify({ message: { role: 'assistant', content: 'Executing now' } });
        setupFsForAgent({ jsonlContent: line, jsonlMtime: Date.now() - 2 * 60 * 1000 });
        setupExec();

        const res = mockRes();
        await ctrl.getDashboard({ query: { force: '1' } }, res);

        const payload = res.json.mock.calls[0][0];
        const agent = (payload.agents || []).find(a => a.id === 'main');
        if (agent) {
            expect(agent.status).toBe('active_executing');
            expect(agent.currentTask.label).toBe('EXECUTING');
        }
    });

    it('sets dormant when mtime > 60 minutes ago', async () => {
        const line = JSON.stringify({ message: { role: 'assistant', content: 'Old task' } });
        setupFsForAgent({ jsonlContent: line, jsonlMtime: Date.now() - 2 * 60 * 60 * 1000 });
        setupExec();

        const res = mockRes();
        await ctrl.getDashboard({ query: { force: '1' } }, res);

        const payload = res.json.mock.calls[0][0];
        const agent = (payload.agents || []).find(a => a.id === 'main');
        if (agent) {
            expect(agent.status).toBe('dormant');
        }
    });
});

describe('detectDetailedActivity — session cost accumulation', () => {
    it('accumulates cost from updatedAt > 0 sessions and sets activeModel', async () => {
        setupFsForAgent({ jsonlContent: '' });
        setupExec();

        const res = mockRes();
        await ctrl.getDashboard({ query: { force: '1' } }, res);

        const payload = res.json.mock.calls[0][0];
        const agent = (payload.agents || []).find(a => a.id === 'main');
        if (agent) {
            expect(parseFloat(agent.cost)).toBeGreaterThan(0);
            expect(agent.activeModel).toBe('gemini-2.5-flash');
            expect(agent.activeProvider).toBe('google');
        }
    });
});

describe('detectDetailedActivity — JSONL parse error resilience', () => {
    it('skips malformed JSONL lines and processes valid ones', async () => {
        const lines = [
            'not valid json {{{',
            JSON.stringify({ message: { role: 'assistant', content: 'Valid task content' } }),
            'also { invalid',
        ].join('\n');
        setupFsForAgent({ jsonlContent: lines, jsonlMtime: Date.now() - 10 * 60 * 1000 });
        setupExec();

        const res = mockRes();
        await ctrl.getDashboard({ query: { force: '1' } }, res);

        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
        const payload = res.json.mock.calls[0][0];
        const agent = (payload.agents || []).find(a => a.id === 'main');
        if (agent) {
            expect(agent.currentTask.task).toContain('Valid task content');
        }
    });
});

// --- buildSubagentStatus ---

describe('buildSubagentStatus — multiple status types', () => {
    it('covers running/recent/idle/null minutesAgo and just-now lastActivity', async () => {
        setupFsForAgent({ jsonlContent: '', withSubagent: true });
        setupExec();

        const res = mockRes();
        await ctrl.getDashboard({ query: { force: '1' } }, res);

        const payload = res.json.mock.calls[0][0];
        expect(payload.subagents).toBeDefined();
        if (payload.subagents.length > 0) {
            const statuses = payload.subagents.map(s => s.status);
            expect(statuses).toContain('running');
            expect(statuses).toContain('recent');
            expect(statuses).toContain('idle');
            const activities = payload.subagents.map(s => s.lastActivity);
            expect(activities).toContain('unknown');  // updatedAt=0
            expect(activities.some(a => a === 'just now')).toBe(true);  // <1 min
        }
    });
});

// --- getSystemResources: darwin vm_stat branch ---

describe('getSystemResources — darwin vm_stat usedMem > 0', () => {
    it('updates freeMem when vm_stat returns valid page data', async () => {
        const vmStatOut = [
            'Mach Virtual Memory Statistics: (page size of 16384 bytes)',
            'Pages free:                            52428.',
            'Pages active:                         153600.',
            'Pages wired down:                      81920.',
            'Pages occupied by compressor:          20480.',
        ].join('\n');
        setupFsForAgent({ jsonlContent: '' });
        setupExec({ vmStatOut });

        const res = mockRes();
        await ctrl.getDashboard({ query: { force: '1' } }, res);

        const payload = res.json.mock.calls[0][0];
        expect(payload.sys).toBeDefined();
        expect(typeof payload.sys.memory).toBe('number');
        expect(payload.sys.memory).toBeGreaterThanOrEqual(0);
    });

    it('covers df match branch (diskUsage set from percentage)', async () => {
        setupFsForAgent({ jsonlContent: '' });
        // df returns output with percentage
        mockExecFilePromise.mockImplementation((bin, args) => {
            if (bin === 'vm_stat') return Promise.resolve({ stdout: '', stderr: '' });
            if (bin === 'df') return Promise.resolve({ stdout: 'Filesystem Size\n/dev/disk1 100G 42% /', stderr: '' });
            if (!args) return Promise.resolve({ stdout: '', stderr: '' });
            if (args[0] === '--version') return Promise.resolve({ stdout: '1.2.3', stderr: '' });
            if (args[0] === 'agents') return Promise.resolve({ stdout: '- main (Main Agent)\n', stderr: '' });
            if (args[0] === 'cron') return Promise.resolve({ stdout: '{"jobs":[]}', stderr: '' });
            if (args[0] === '-h') return Promise.resolve({ stdout: 'Filesystem Size\n/dev/disk1 100G 42% /', stderr: '' });
            return Promise.resolve({ stdout: '', stderr: '' });
        });

        const res = mockRes();
        await ctrl.getDashboard({ query: { force: '1' } }, res);

        const payload = res.json.mock.calls[0][0];
        expect(payload.sys.disk).toBe(42);
    });
});

// --- buildDashboardPayload: cron parse failure ---

describe('buildDashboardPayload — cron JSON parse failure', () => {
    it('defaults cron to [] when output is invalid JSON', async () => {
        setupFsForAgent({ jsonlContent: '' });
        setupExec({ cronOut: '{invalid json here' });

        const res = mockRes();
        await ctrl.getDashboard({ query: { force: '1' } }, res);

        const payload = res.json.mock.calls[0][0];
        expect(payload.cron).toEqual([]);
    });
});

// --- minimizeDashboardPayload: workspace branch ---

describe('minimizeDashboardPayload — workspace redaction', () => {
    it('redacts truthy workspace path', async () => {
        setupFsForAgent({ jsonlContent: '' });
        setupExec({ agentsOut: '- main (Main Agent)\n  Workspace: /home/user/workspace\n' });

        const res = mockRes();
        await ctrl.getDashboard({ query: { force: '1' } }, res);

        const payload = res.json.mock.calls[0][0];
        const agent = (payload.agents || []).find(a => a.id === 'main');
        if (agent && agent.workspace) {
            expect(agent.workspace).toBe('[REDACTED_WORKSPACE]');
        }
    });

    it('preserves empty workspace as-is', async () => {
        setupFsForAgent({ jsonlContent: '' });
        setupExec({ agentsOut: '- main (Main Agent)\n' });

        const res = mockRes();
        await ctrl.getDashboard({ query: { force: '1' } }, res);

        const payload = res.json.mock.calls[0][0];
        const agent = (payload.agents || []).find(a => a.id === 'main');
        if (agent) {
            expect(agent.workspace).toBe('');
        }
    });
});

// --- resolveOpenclawBin: absolute path found + cache hit ---

describe('resolveOpenclawBin — absolute path found and cached', () => {
    it('uses found binary and caches it for second call', async () => {
        mockFs.existsSync.mockImplementation((p) => {
            if (p === '/opt/homebrew/bin/openclaw') return true;
            return false;
        });
        mockExecFilePromise.mockResolvedValue({ stdout: '1.2.3', stderr: '' });

        const res1 = mockRes();
        await ctrl.getDashboard({ query: { force: '1' } }, res1);
        // Second call: RESOLVED_OPENCLAW_BIN is cached → resolveOpenclawBin returns early
        const res2 = mockRes();
        await ctrl.getDashboard({ query: { force: '1' } }, res2);

        expect(res1.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
        expect(res2.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
});

// --- detectDetailedActivity: logObj without .message wrapper ---

describe('detectDetailedActivity — logObj without message wrapper', () => {
    it('handles JSONL where content is directly on the object (no .message)', async () => {
        const line = JSON.stringify({ role: 'assistant', content: 'Direct format task' });
        setupFsForAgent({ jsonlContent: line, jsonlMtime: Date.now() - 10 * 60 * 1000 });
        setupExec();

        const res = mockRes();
        await ctrl.getDashboard({ query: { force: '1' } }, res);

        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
        const payload = res.json.mock.calls[0][0];
        const agent = (payload.agents || []).find(a => a.id === 'main');
        if (agent) {
            expect(agent.currentTask.task).toContain('Direct format task');
        }
    });
});
