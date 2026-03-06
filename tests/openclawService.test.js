// openclawService tests
const mockExecPromise = jest.fn();

jest.mock('util', () => ({
    promisify: jest.fn(() => mockExecPromise),
}));

const mockFs = {
    existsSync: jest.fn().mockReturnValue(false),
    statSync: jest.fn().mockReturnValue({ mtimeMs: 0 }),
    readdirSync: jest.fn().mockReturnValue([]),
};
jest.mock('fs', () => mockFs);

jest.mock('child_process', () => ({ exec: jest.fn() }));

let service;

beforeEach(() => {
    jest.resetModules();
    jest.mock('util', () => ({ promisify: jest.fn(() => mockExecPromise) }));
    jest.mock('fs', () => mockFs);
    jest.mock('child_process', () => ({ exec: jest.fn() }));

    mockExecPromise.mockReset();
    Object.values(mockFs).forEach(fn => typeof fn.mockReset === 'function' && fn.mockReset());
    mockFs.existsSync.mockReturnValue(false);
    mockFs.statSync.mockReturnValue({ mtimeMs: 0 });
    mockFs.readdirSync.mockReturnValue([]);

    service = require('../src/backend/services/openclawService');
});

describe('getOpenClawData', () => {
    it('returns parsed JSON on success', async () => {
        mockExecPromise.mockResolvedValue({ stdout: '{"agents":[]}' });
        const result = await service.getOpenClawData('openclaw agents list');
        expect(result).toEqual({ agents: [] });
    });

    it('returns raw string when parseJson=false', async () => {
        mockExecPromise.mockResolvedValue({ stdout: 'raw text output' });
        const result = await service.getOpenClawData('openclaw status', false);
        expect(result).toBe('raw text output');
    });

    it('uses cache on second call within TTL', async () => {
        mockExecPromise.mockResolvedValue({ stdout: '{"agents":[]}' });
        await service.getOpenClawData('openclaw agents list', false);
        // Second call should use cache
        mockExecPromise.mockClear();
        const result = await service.getOpenClawData('openclaw agents list', false);
        expect(mockExecPromise).not.toHaveBeenCalled();
        expect(result).toBe('{"agents":[]}');
    });

    it('returns cached parsed JSON on second call', async () => {
        mockExecPromise.mockResolvedValue({ stdout: '{"agents":[{"id":"main"}]}' });
        await service.getOpenClawData('openclaw agents list', true);
        mockExecPromise.mockClear();
        const result = await service.getOpenClawData('openclaw agents list', true);
        expect(mockExecPromise).not.toHaveBeenCalled();
        expect(result).toEqual({ agents: [{ id: 'main' }] });
    });

    it('returns empty object on error when parseJson=true', async () => {
        mockExecPromise.mockRejectedValue(new Error('command not found'));
        const result = await service.getOpenClawData('openclaw bad-command');
        expect(result).toEqual({});
    });

    it('returns empty string on error when parseJson=false', async () => {
        mockExecPromise.mockRejectedValue(new Error('command not found'));
        const result = await service.getOpenClawData('openclaw status', false);
        expect(result).toBe('');
    });

    it('replaces openclaw with full binary path', async () => {
        mockExecPromise.mockResolvedValue({ stdout: '"ok"' });
        await service.getOpenClawData('openclaw health');
        expect(mockExecPromise).toHaveBeenCalledWith(expect.stringContaining('.openclaw/bin/openclaw'), {});
    });

    it('passes non-openclaw command as-is (else branch)', async () => {
        mockExecPromise.mockResolvedValue({ stdout: '"ok"' });
        await service.getOpenClawData('echo "hello"', false);
        expect(mockExecPromise).toHaveBeenCalledWith('echo "hello"', {});
    });
});

describe('parseAgentsList', () => {
    it('parses agent list text', () => {
        const text = `- main (Main Agent)
  Workspace: ~/.openclaw/workspace-main
  Model: gemini-3-flash`;
        const agents = service.parseAgentsList(text);
        expect(agents.length).toBe(1);
        expect(agents[0].id).toBe('main');
        expect(agents[0].workspace).toBe('~/.openclaw/workspace-main');
        expect(agents[0].model).toBe('gemini-3-flash');
    });

    it('handles multiple agents', () => {
        const text = `- main (Main)\n- work (Work Agent)`;
        const agents = service.parseAgentsList(text);
        expect(agents.length).toBe(2);
    });

    it('returns empty array for empty text', () => {
        expect(service.parseAgentsList('')).toEqual([]);
    });
});

describe('detectRealActivity', () => {
    it('returns inactive when no files found (latestModification=0)', () => {
        mockFs.existsSync.mockReturnValue(false);
        const result = service.detectRealActivity('main', '~/.openclaw/workspace-main');
        expect(result.status).toBe('inactive');
    });

    it('returns active_executing when file modified < 5 minutes ago', () => {
        const recentTime = Date.now() - 2 * 60 * 1000; // 2 minutes ago
        mockFs.existsSync.mockReturnValue(true);
        mockFs.statSync.mockReturnValue({ mtimeMs: recentTime });
        mockFs.readdirSync.mockReturnValue([]);
        const result = service.detectRealActivity('main', '~/.openclaw/workspace-main');
        expect(result.status).toBe('active_executing');
    });

    it('returns active_recent when file modified 5-60 minutes ago', () => {
        const time = Date.now() - 30 * 60 * 1000; // 30 minutes ago
        mockFs.existsSync.mockReturnValue(true);
        mockFs.statSync.mockReturnValue({ mtimeMs: time });
        mockFs.readdirSync.mockReturnValue([]);
        const result = service.detectRealActivity('main', '~/.openclaw/workspace-main');
        expect(result.status).toBe('active_recent');
    });

    it('returns dormant when file modified >4 hours ago', () => {
        const time = Date.now() - 5 * 60 * 60 * 1000; // 5 hours ago
        mockFs.existsSync.mockReturnValue(true);
        mockFs.statSync.mockReturnValue({ mtimeMs: time });
        mockFs.readdirSync.mockReturnValue([]);
        const result = service.detectRealActivity('main', '~/.openclaw/workspace-main');
        expect(result.status).toBe('dormant');
    });

    it('returns error on exception', () => {
        mockFs.existsSync.mockImplementation(() => { throw new Error('fs error'); });
        const result = service.detectRealActivity('main', '~/.openclaw/workspace-main');
        expect(result.status).toBe('error');
    });

    it('checks sessions directory when it exists', () => {
        const now = Date.now();
        mockFs.existsSync.mockImplementation((p) => {
            // workspace files don't exist, but sessions dir does
            if (p.includes('sessions')) return true;
            if (p.endsWith('.jsonl')) return true;
            return false;
        });
        mockFs.readdirSync.mockReturnValue(['session1.jsonl']);
        mockFs.statSync.mockReturnValue({ mtimeMs: now - 1 * 60 * 1000 }); // 1 minute ago
        const result = service.detectRealActivity('main', '~/.openclaw/workspace-main');
        expect(result.status).toBe('active_executing');
    });
});
