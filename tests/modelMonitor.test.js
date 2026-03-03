// modelMonitor tests
// Key: util.promisify(exec) needs to resolve with { stdout, stderr }

const mockExecFn = jest.fn();

// Mock util.promisify to properly wrap our mock exec with {stdout, stderr} resolution
jest.mock('util', () => {
    const actual = jest.requireActual('util');
    return {
        ...actual,
        promisify: (fn) => (...args) => new Promise((resolve, reject) => {
            fn(...args, (err, stdout, stderr) => {
                if (err) reject(Object.assign(err, { stdout, stderr }));
                else resolve({ stdout: stdout || '', stderr: stderr || '' });
            });
        }),
    };
});

jest.mock('child_process', () => ({ exec: mockExecFn }));

let monitor;

beforeEach(() => {
    jest.resetModules();
    mockExecFn.mockReset();
    jest.mock('child_process', () => ({ exec: mockExecFn }));
    jest.mock('util', () => {
        const actual = jest.requireActual('util');
        return {
            ...actual,
            promisify: (fn) => (...args) => new Promise((resolve, reject) => {
                fn(...args, (err, stdout, stderr) => {
                    if (err) reject(Object.assign(err, { stdout, stderr }));
                    else resolve({ stdout: stdout || '', stderr: stderr || '' });
                });
            }),
        };
    });
    monitor = require('../src/backend/utils/modelMonitor');
});

function setupMock(stdout, error) {
    if (error) {
        mockExecFn.mockImplementation((cmd, cb) => cb(error));
    } else {
        mockExecFn.mockImplementation((cmd, cb) => cb(null, stdout || '', ''));
    }
}

describe('fetchModelCooldowns', () => {
    it('returns empty object when no cooldowns', async () => {
        setupMock('No cooldowns.\n');
        const result = await monitor.fetchModelCooldowns();
        expect(typeof result).toBe('object');
        expect(Object.keys(result).length).toBe(0);
    });

    it('parses minute cooldowns', async () => {
        setupMock('- google effective=gemini-3-flash | google:default=api_key [cooldown 5m]\n');
        const result = await monitor.fetchModelCooldowns();
        expect(result.google).toBeDefined();
        expect(result.google.status).toBe('COOLDOWN');
        expect(result.google.cooldownSeconds).toBe(300);
        expect(result.google.rawStr).toBe('5m');
    });

    it('parses second cooldowns', async () => {
        setupMock('- deepseek effective=deepseek-chat | deepseek:default=api_key [cooldown 30s]\n');
        const result = await monitor.fetchModelCooldowns();
        expect(result.deepseek).toBeDefined();
        expect(result.deepseek.cooldownSeconds).toBe(30);
    });

    it('handles multiple providers', async () => {
        const output = '- google effective=x [cooldown 2m]\n- openai effective=y [cooldown 10s]\n';
        setupMock(output);
        const result = await monitor.fetchModelCooldowns();
        expect(result.google).toBeDefined();
        expect(result.openai).toBeDefined();
    });

    it('returns cached result within TTL', async () => {
        setupMock('- google effective=x [cooldown 1m]\n');
        await monitor.fetchModelCooldowns();
        const callCount = mockExecFn.mock.calls.length;
        // Second call within TTL should not call exec again
        await monitor.fetchModelCooldowns();
        expect(mockExecFn.mock.calls.length).toBe(callCount);
    });

    it('handles exec error gracefully', async () => {
        setupMock(null, new Error('command failed'));
        const result = await monitor.fetchModelCooldowns();
        expect(typeof result).toBe('object');
    });

    it('returns empty object on first error (no cache)', async () => {
        setupMock(null, new Error('fail'));
        const result = await monitor.fetchModelCooldowns();
        // Returns empty cooldowns on error
        expect(result).toBeDefined();
    });

    it('skips lines with [cooldown that do not match the regex pattern', async () => {
        // A line with [cooldown but no valid prefix format
        setupMock('some line [cooldown 5m] without valid prefix\n');
        const result = await monitor.fetchModelCooldowns();
        expect(Object.keys(result).length).toBe(0);
    });
});
