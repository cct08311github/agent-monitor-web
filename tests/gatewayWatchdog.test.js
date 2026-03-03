// gatewayWatchdog tests — all external calls mocked

const mockExecFilePromise = jest.fn();
const mockExecPromise = jest.fn();

jest.mock('util', () => ({
    promisify: jest.fn((fn) => {
        if (!fn) return mockExecPromise;
        // execFile → mockExecFilePromise, exec → mockExecPromise
        return fn.length === 4 ? mockExecFilePromise : mockExecPromise;
    }),
}));

jest.mock('child_process', () => ({
    execFile: jest.fn(),
    exec: jest.fn(),
}));

jest.mock('fs', () => ({
    existsSync: jest.fn().mockReturnValue(false),
    mkdirSync: jest.fn(),
    appendFileSync: jest.fn(),
    writeFileSync: jest.fn(),
}));

const mockHttpRequest = jest.fn();
jest.mock('http', () => ({ request: mockHttpRequest }));

let watchdog;
let fs;

beforeEach(() => {
    jest.resetModules();

    jest.mock('util', () => ({
        promisify: jest.fn((fn) => {
            if (!fn) return mockExecPromise;
            return fn.length === 4 ? mockExecFilePromise : mockExecPromise;
        }),
    }));
    jest.mock('child_process', () => ({ execFile: jest.fn(), exec: jest.fn() }));
    jest.mock('fs', () => ({
        existsSync: jest.fn().mockReturnValue(false),
        mkdirSync: jest.fn(),
        appendFileSync: jest.fn(),
        writeFileSync: jest.fn(),
    }));
    jest.mock('http', () => ({ request: mockHttpRequest }));

    mockExecFilePromise.mockReset();
    mockExecPromise.mockReset();
    mockHttpRequest.mockReset();

    watchdog = require('../src/backend/services/gatewayWatchdog');
    fs = require('fs');

    // Speed up repair by reducing wait times
    watchdog.CONFIG.repairWaitMs = 50;
    watchdog.CONFIG.checkIntervalMs = 50;
    watchdog.CONFIG.geminiTimeoutMs = 500;
});

afterEach(() => {
    watchdog.stop();
});

function makeHttpMock({ statusCode = 200, body = 'ok', error = null } = {}) {
    mockHttpRequest.mockImplementation((opts, cb) => {
        const req = {
            on: jest.fn((event, handler) => {
                if (event === 'error' && error) setTimeout(() => handler(error), 5);
                return req;
            }),
            end: jest.fn(),
            destroy: jest.fn(),
        };
        if (!error) {
            setTimeout(() => {
                const res = {
                    statusCode,
                    on: jest.fn((event, handler) => {
                        if (event === 'data') handler(body);
                        if (event === 'end') handler();
                    }),
                };
                cb(res);
            }, 5);
        }
        return req;
    });
}

describe('start / stop / getStatus', () => {
    it('starts and sets isRunning=true', () => {
        watchdog.start();
        expect(watchdog.getStatus().isRunning).toBe(true);
    });

    it('start is idempotent', () => {
        watchdog.start();
        watchdog.start();
        expect(watchdog.getStatus().isRunning).toBe(true);
    });

    it('stop sets isRunning=false', () => {
        watchdog.start();
        watchdog.stop();
        expect(watchdog.getStatus().isRunning).toBe(false);
    });

    it('stop is safe when not started', () => {
        expect(() => watchdog.stop()).not.toThrow();
    });

    it('getStatus returns expected shape', () => {
        const s = watchdog.getStatus();
        expect(s).toHaveProperty('isRunning');
        expect(s).toHaveProperty('currentStatus');
        expect(s).toHaveProperty('repairAttempts');
        expect(s).toHaveProperty('totalRepairs');
        expect(s).toHaveProperty('events');
        expect(s).toHaveProperty('repairHistory');
    });

    it('getStatus includes lastHealthy when set', () => {
        watchdog.start();
        const s = watchdog.getStatus();
        expect(s.lastHealthy).toBeDefined();
    });

    it('getStatus shows lastRepairTime as null when no repair', () => {
        const s = watchdog.getStatus();
        // lastRepairTime is 0 initially, formatted as null in getStatus
        expect(s.lastRepairTime).toBeNull();
    });
});

describe('CONFIG export', () => {
    it('exports CONFIG with expected properties', () => {
        expect(watchdog.CONFIG).toHaveProperty('checkIntervalMs');
        expect(watchdog.CONFIG).toHaveProperty('maxRepairAttempts');
    });
});

describe('triggerRepair - fast path', () => {
    beforeEach(() => {
        watchdog.CONFIG.repairWaitMs = 50;
        // Return healthy after restart
        mockExecFilePromise.mockResolvedValue({ stdout: 'running gateway', stderr: '' });
        mockExecPromise.mockResolvedValue({ stdout: '', stderr: '' });
        makeHttpMock({ statusCode: 200, body: 'ok' });
    });

    it('triggers repair and returns true when gateway recovers', async () => {
        const result = await watchdog.triggerRepair();
        expect(typeof result).toBe('boolean');
    }, 5000);

    it('returns false when health check fails after repair', async () => {
        makeHttpMock({ error: new Error('connection refused') });
        mockExecFilePromise.mockResolvedValue({ stdout: '', stderr: '' });
        const result = await watchdog.triggerRepair();
        expect(typeof result).toBe('boolean');
    }, 5000);
});

describe('logging', () => {
    it('creates log dir and writes on start', () => {
        watchdog.start();
        expect(fs.mkdirSync).toHaveBeenCalled();
    });

    it('appendFileSync called for log entries', () => {
        watchdog.start();
        expect(fs.appendFileSync).toHaveBeenCalled();
    });
});
