const path = require('path');

const mockFs = {
    existsSync: jest.fn(),
    readFileSync: jest.fn(),
    readdirSync: jest.fn(),
    statSync: jest.fn(),
    promises: {
        access: jest.fn(),
        readFile: jest.fn(),
        readdir: jest.fn(),
        stat: jest.fn(),
    },
};

const mockExecFilePromise = jest.fn();
const mockFetch = jest.fn();

const mockTsdb = {
    saveSnapshot: jest.fn(),
};

const mockAgentWatcher = {
    start: jest.fn(),
    stop: jest.fn(),
    on: jest.fn(),
    removeAllListeners: jest.fn(),
};

const mockAlertEngine = {
    evaluate: jest.fn(),
};

const mockModelMonitor = {
    fetchModelCooldowns: jest.fn(),
};

const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
};

const mockOs = {
    homedir: jest.fn(() => '/tmp/home'),
    cpus: jest.fn(() => [
        { times: { user: 10, nice: 0, sys: 5, idle: 85, irq: 0 } },
        { times: { user: 10, nice: 0, sys: 5, idle: 85, irq: 0 } },
    ]),
    loadavg: jest.fn(() => [0.5, 0.25, 0.1]),
    totalmem: jest.fn(() => 16 * 1024 * 1024 * 1024),
    freemem: jest.fn(() => 8 * 1024 * 1024 * 1024),
    platform: jest.fn(() => 'linux'),
    uptime: jest.fn(() => 3600),
};

jest.mock('fs', () => mockFs);
jest.mock('util', () => ({ promisify: jest.fn(() => mockExecFilePromise) }));
jest.mock('child_process', () => ({
    exec: jest.fn(),
    execFile: jest.fn(),
}));
jest.mock('node-fetch', () => mockFetch);
jest.mock('os', () => mockOs);
jest.mock('../src/backend/services/tsdbService', () => mockTsdb);
jest.mock('../src/backend/services/agentWatcherService', () => mockAgentWatcher);
jest.mock('../src/backend/services/alertEngine', () => mockAlertEngine);
jest.mock('../src/backend/utils/modelMonitor', () => mockModelMonitor);
jest.mock('../src/backend/utils/logger', () => mockLogger);

function makeDeferred() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

function configureFsForDashboard({ sessionsJson = '{}', latestLog = '' } = {}) {
    const openclawRoot = '/tmp/home/.openclaw';
    const agentsRoot = path.join(openclawRoot, 'agents');
    const sessionsDir = path.join(agentsRoot, 'main', 'sessions');
    const sessionsJsonPath = path.join(sessionsDir, 'sessions.json');
    const latestLogPath = path.join(sessionsDir, 'session1.jsonl');

    // Sync mocks (kept for resolveOpenclawBin which still uses existsSync)
    mockFs.existsSync.mockImplementation((targetPath) => (
        targetPath === path.join(openclawRoot, 'bin', 'openclaw') ||
        targetPath === sessionsDir ||
        targetPath === sessionsJsonPath
    ));

    // Async mocks for detectDetailedActivity + buildSubagentStatus
    mockFs.promises.access.mockImplementation((targetPath) => {
        if (targetPath === sessionsDir ||
            targetPath === sessionsJsonPath) {
            return Promise.resolve();
        }
        return Promise.reject(new Error('ENOENT'));
    });
    mockFs.promises.readdir.mockImplementation((targetPath) => {
        if (targetPath === sessionsDir) return Promise.resolve(latestLog ? ['session1.jsonl'] : []);
        if (targetPath === agentsRoot) return Promise.resolve(['main']);
        return Promise.resolve([]);
    });
    mockFs.promises.stat.mockResolvedValue({ mtimeMs: Date.now() - 120000 });
    mockFs.promises.readFile.mockImplementation((targetPath) => {
        if (targetPath === sessionsJsonPath) return Promise.resolve(sessionsJson);
        if (targetPath === latestLogPath) return Promise.resolve(latestLog);
        return Promise.reject(new Error(`unexpected path ${targetPath}`));
    });

    // Keep sync mocks for any remaining sync callers
    mockFs.readdirSync.mockImplementation((targetPath) => {
        if (targetPath === sessionsDir) return latestLog ? ['session1.jsonl'] : [];
        if (targetPath === agentsRoot) return ['main'];
        return [];
    });
    mockFs.statSync.mockReturnValue({ mtimeMs: Date.now() - 120000 });
    mockFs.readFileSync.mockImplementation((targetPath) => {
        if (targetPath === sessionsJsonPath) return sessionsJson;
        if (targetPath === latestLogPath) return latestLog;
        throw new Error(`unexpected path ${targetPath}`);
    });
}

function configureExecFileSuccess() {
    mockExecFilePromise.mockImplementation((bin, args) => {
        if (bin === 'free') {
            return Promise.resolve({
                stdout: 'Mem: 16000000000 8000000000 4000000000 0 0 4000000000',
                stderr: '',
            });
        }
        if (bin === 'df') {
            return Promise.resolve({
                stdout: 'Filesystem Size Used Avail Use% Mounted on\n/dev/disk1 100G 50G 50G 50% /',
                stderr: '',
            });
        }
        if (args && args[0] === '--version') return Promise.resolve({ stdout: 'openclaw 1.2.3', stderr: '' });
        if (args && args[0] === 'agents') {
            return Promise.resolve({
                stdout: '- main (Main Agent)\n  Workspace: /tmp/home/projects/secret\n  Model: gemini-2.5-flash',
                stderr: '',
            });
        }
        if (args && args[0] === 'cron') {
            return Promise.resolve({
                stdout: '{"jobs":[{"id":"job1","name":"Nightly","enabled":true,"state":{"nextRunAtMs":1,"lastStatus":"ok","lastRunAtMs":2,"lastError":""}}]}',
                stderr: '',
            });
        }
        if (args && args[0] === 'status') {
            return Promise.resolve({ stdout: '', stderr: '' });
        }
        throw new Error(`unexpected execFile call ${bin} ${JSON.stringify(args)}`);
    });
}

describe('dashboardPayloadService', () => {
    let service;

    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
        jest.useRealTimers();

        Object.values(mockFs).forEach((fn) => typeof fn.mockReset === 'function' && fn.mockReset());
        Object.values(mockFs.promises).forEach((fn) => fn.mockReset());
        Object.values(mockTsdb).forEach((fn) => fn.mockReset());
        Object.values(mockAgentWatcher).forEach((fn) => typeof fn.mockReset === 'function' && fn.mockReset());
        Object.values(mockAlertEngine).forEach((fn) => fn.mockReset());
        Object.values(mockModelMonitor).forEach((fn) => fn.mockReset());
        Object.values(mockLogger).forEach((fn) => fn.mockReset());
        Object.values(mockOs).forEach((fn) => typeof fn.mockReset === 'function' && fn.mockReset());
        mockOs.homedir.mockReturnValue('/tmp/home');
        mockOs.cpus.mockReturnValue([
            { times: { user: 10, nice: 0, sys: 5, idle: 85, irq: 0 } },
            { times: { user: 10, nice: 0, sys: 5, idle: 85, irq: 0 } },
        ]);
        mockOs.loadavg.mockReturnValue([0.5, 0.25, 0.1]);
        mockOs.totalmem.mockReturnValue(16 * 1024 * 1024 * 1024);
        mockOs.freemem.mockReturnValue(8 * 1024 * 1024 * 1024);
        mockOs.platform.mockReturnValue('linux');
        mockOs.uptime.mockReturnValue(3600);

        mockFetch.mockReset();
        mockExecFilePromise.mockReset();
        mockAlertEngine.evaluate.mockReturnValue([]);
        mockModelMonitor.fetchModelCooldowns.mockResolvedValue({ 'gemini-2.5-flash': { status: 'ok' } });

        configureFsForDashboard({
            sessionsJson: JSON.stringify({
                main_session: {
                    updatedAt: Date.now() - 60000,
                    inputTokens: 1000,
                    outputTokens: 500,
                    cacheRead: 100,
                    totalTokens: 1500,
                    model: 'gemini-2.5-flash',
                    modelProvider: 'google',
                },
            }),
            latestLog: JSON.stringify({
                message: {
                    role: 'assistant',
                    content: [{ type: 'text', text: 'Inspect /tmp/home/.openclaw/agents/main carefully' }],
                },
            }),
        });
        configureExecFileSuccess();
        mockFetch.mockResolvedValue({
            json: jest.fn().mockResolvedValue({ rates: { TWD: 31.5 } }),
        });

        service = require('../src/backend/services/dashboardPayloadService');
        service.invalidateSharedPayload();
    });

    it('updates shared payload, redacts sensitive fields, and emits alerts to SSE clients', async () => {
        const healthyClient = { write: jest.fn() };
        const brokenClient = { write: jest.fn(() => { throw new Error('socket closed'); }) };
        mockAlertEngine.evaluate.mockReturnValue([{ severity: 'high', message: 'alert' }]);

        service.addSseClient(healthyClient);
        service.addSseClient(brokenClient);

        const result = await service.updateSharedData();
        const payload = service.getSharedPayload();

        expect(result).toBe(true);
        expect(payload).toEqual(expect.objectContaining({
            success: true,
            exchangeRate: 31.5,
            cron: [expect.objectContaining({ id: 'job1', name: 'Nightly' })],
            cooldowns: { 'gemini-2.5-flash': { status: 'ok' } },
        }));
        expect(payload.agents[0].workspace).toBe('[REDACTED_WORKSPACE]');
        expect(payload.agents[0].currentTask.task).toContain('[REDACTED_PATH]');
        expect(mockTsdb.saveSnapshot).toHaveBeenCalledWith(payload.sys, payload.agents);
        expect(healthyClient.write).toHaveBeenCalledWith(expect.stringContaining('"alerts":[{"severity":"high","message":"alert"}]'));
        expect(service.shouldRefreshSharedPayload()).toBe(false);

        service.invalidateSharedPayload();
        expect(service.getSharedPayload()).toBeNull();
        expect(service.shouldRefreshSharedPayload()).toBe(true);
    });

    it('deduplicates concurrent shared updates with a single pending promise', async () => {
        const agentsListDeferred = makeDeferred();
        let agentsListCalls = 0;

        mockExecFilePromise.mockImplementation((bin, args) => {
            if (bin === 'free') {
                return Promise.resolve({ stdout: 'Mem: 16000000000 8000000000 4000000000 0 0 4000000000', stderr: '' });
            }
            if (bin === 'df') {
                return Promise.resolve({ stdout: 'Filesystem\n/dev/disk1 100G 50G 50G 50% /', stderr: '' });
            }
            if (args && args[0] === '--version') return Promise.resolve({ stdout: 'openclaw 1.2.3', stderr: '' });
            if (args && args[0] === 'cron') return Promise.resolve({ stdout: '{"jobs":[]}', stderr: '' });
            if (args && args[0] === 'agents') {
                agentsListCalls += 1;
                return agentsListDeferred.promise;
            }
            throw new Error(`unexpected execFile call ${bin} ${JSON.stringify(args)}`);
        });

        const first = service.updateSharedData();
        const second = service.updateSharedData();

        agentsListDeferred.resolve({ stdout: '- main (Main Agent)', stderr: '' });
        await Promise.all([first, second]);

        expect(agentsListCalls).toBe(1);
        expect(mockTsdb.saveSnapshot).toHaveBeenCalledTimes(1);
        expect(service.getSharedPayload()).toEqual(expect.objectContaining({ success: true }));
    });

    it('starts global polling only once and wires the agent watcher a single time', () => {
        jest.useFakeTimers();
        const setIntervalSpy = jest.spyOn(global, 'setInterval');

        service.startGlobalPolling();
        service.startGlobalPolling();

        expect(mockAgentWatcher.start).toHaveBeenCalledTimes(1);
        expect(mockAgentWatcher.on).toHaveBeenCalledTimes(1);
        expect(setIntervalSpy).toHaveBeenCalledTimes(1);

        setIntervalSpy.mockRestore();
    });

    it('removes state_update listener in stopGlobalPolling to prevent accumulation on restart', () => {
        jest.useFakeTimers();

        // First start/stop cycle
        service.startGlobalPolling();
        expect(mockAgentWatcher.on).toHaveBeenCalledTimes(1);
        expect(mockAgentWatcher.on).toHaveBeenCalledWith('state_update', expect.any(Function));

        service.stopGlobalPolling();
        expect(mockAgentWatcher.removeAllListeners).toHaveBeenCalledWith('state_update');
        expect(mockAgentWatcher.stop).toHaveBeenCalledTimes(1);

        // Second start should add exactly one listener, not accumulate
        service.startGlobalPolling();
        expect(mockAgentWatcher.on).toHaveBeenCalledTimes(2);

        // After the second stop, removeAllListeners should have been called twice total
        service.stopGlobalPolling();
        expect(mockAgentWatcher.removeAllListeners).toHaveBeenCalledTimes(2);
    });

    it('removes clients explicitly and forwards explicit openclaw reads', async () => {
        const brokenClient = { write: jest.fn(() => { throw new Error('disconnect'); }) };
        const healthyClient = { write: jest.fn() };

        service.addSseClient(brokenClient);
        service.addSseClient(healthyClient);

        await service.updateSharedData();
        service.removeSseClient(healthyClient);

        await service.updateSharedData();
        const result = await service.runOpenclawRead(['status']);

        expect(result).toEqual({ stdout: '', stderr: '' });
        expect(mockExecFilePromise).toHaveBeenLastCalledWith('/tmp/home/.openclaw/bin/openclaw', ['status']);
    });

    it('warns when agent activity cannot be read but still returns the fallback detail', async () => {
        mockFs.promises.readFile.mockImplementation((targetPath) => {
            if (targetPath.endsWith('sessions.json')) {
                return Promise.reject(new Error('sessions broken'));
            }
            return Promise.resolve('');
        });

        const result = await service.updateSharedData();

        expect(result).toBe(true);
        expect(mockLogger.warn).toHaveBeenCalledWith('agent_activity_read_failed', expect.objectContaining({
            agentId: 'main',
            msg: 'sessions broken',
        }));
        expect(service.getSharedPayload().agents[0]).toEqual(expect.objectContaining({
            status: 'inactive',
            currentTask: { label: 'Idle', task: '' },
        }));
    });

    it('serves cached agent data within TTL instead of rebuilding', async () => {
        // First call builds payload
        await service.updateSharedData();
        const firstPayload = service.getSharedPayload();
        expect(firstPayload).toBeTruthy();

        // Record call counts after first build
        const agentsCallCount = mockExecFilePromise.mock.calls
            .filter(c => c[1] && c[1][0] === 'agents').length;

        // Second call within TTL should reuse cache
        await service.updateSharedData();
        const secondPayload = service.getSharedPayload();

        // agents CLI should NOT have been called again (10s TTL)
        const agentsCallCount2 = mockExecFilePromise.mock.calls
            .filter(c => c[1] && c[1][0] === 'agents').length;
        expect(agentsCallCount2).toBe(agentsCallCount);
        expect(secondPayload.agents).toEqual(firstPayload.agents);
    });

    it('warns when subagent sessions json or cron json cannot be parsed', async () => {
        const agentsRoot = '/tmp/home/.openclaw/agents';
        const sessionsDir = path.join(agentsRoot, 'main', 'sessions');
        const sessionsJsonPath = path.join(sessionsDir, 'sessions.json');

        mockFs.existsSync.mockImplementation((targetPath) => (
            targetPath === '/tmp/home/.openclaw/bin/openclaw'
        ));
        mockFs.promises.readdir.mockImplementation((targetPath) => {
            if (targetPath === agentsRoot) return Promise.resolve(['main']);
            if (targetPath === sessionsDir) return Promise.resolve([]);
            return Promise.resolve([]);
        });
        mockFs.promises.access.mockImplementation((targetPath) => {
            if (targetPath === '/tmp/home/.openclaw/bin/openclaw' ||
                targetPath === sessionsDir ||
                targetPath === sessionsJsonPath) {
                return Promise.resolve();
            }
            return Promise.reject(new Error('ENOENT'));
        });
        mockFs.promises.readFile.mockImplementation((targetPath) => {
            if (targetPath === sessionsJsonPath) return Promise.resolve('{bad json');
            return Promise.reject(new Error(`unexpected path ${targetPath}`));
        });
        mockExecFilePromise.mockImplementation((bin, args) => {
            if (bin === 'free') return Promise.resolve({ stdout: 'Mem: 16000000000 8000000000 4000000000 0 0 4000000000', stderr: '' });
            if (bin === 'df') return Promise.resolve({ stdout: 'Filesystem\n/dev/disk1 100G 50G 50G 50% /', stderr: '' });
            if (args && args[0] === '--version') return Promise.resolve({ stdout: 'openclaw 1.2.3', stderr: '' });
            if (args && args[0] === 'agents') return Promise.resolve({ stdout: '- main (Main Agent)', stderr: '' });
            if (args && args[0] === 'cron') return Promise.resolve({ stdout: '{bad json', stderr: '' });
            throw new Error(`unexpected execFile call ${bin} ${JSON.stringify(args)}`);
        });

        const result = await service.updateSharedData();

        expect(result).toBe(true);
        expect(mockLogger.warn).toHaveBeenCalledWith('subagent_sessions_parse_failed', expect.objectContaining({
            agentDirName: 'main',
        }));
        expect(mockLogger.warn).toHaveBeenCalledWith('cron_jobs_parse_failed', expect.objectContaining({
            msg: expect.stringContaining('Expected property name'),
        }));
    });
});
