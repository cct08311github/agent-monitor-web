'use strict';

describe('Graceful Shutdown — sseStreamManager.closeAll', () => {
    let sseStreamManager;

    beforeEach(() => {
        jest.resetModules();
        sseStreamManager = require('../src/backend/services/sseStreamManager');
    });

    afterEach(() => {
        sseStreamManager.stopHeartbeat();
    });

    test('closeAll sends server-shutdown event and ends each client', () => {
        const client1 = { write: jest.fn(), end: jest.fn() };
        const client2 = { write: jest.fn(), end: jest.fn() };

        sseStreamManager.addClient(client1);
        sseStreamManager.addClient(client2);
        expect(sseStreamManager.getClientCount()).toBe(2);

        sseStreamManager.closeAll();

        expect(client1.write).toHaveBeenCalledWith(
            expect.stringContaining('event: server-shutdown')
        );
        expect(client1.write).toHaveBeenCalledWith(
            expect.stringContaining('"reason":"server_restart"')
        );
        expect(client1.end).toHaveBeenCalled();
        expect(client2.end).toHaveBeenCalled();
        expect(sseStreamManager.getClientCount()).toBe(0);
    });

    test('closeAll handles already-closed clients without throwing', () => {
        const badClient = {
            write: jest.fn(() => { throw new Error('write after end'); }),
            end: jest.fn(),
        };
        sseStreamManager.addClient(badClient);

        expect(() => sseStreamManager.closeAll()).not.toThrow();
        expect(sseStreamManager.getClientCount()).toBe(0);
    });

    test('closeAll stops heartbeat timer', () => {
        jest.useFakeTimers();
        sseStreamManager.startHeartbeat();
        const client = { write: jest.fn(), end: jest.fn() };
        sseStreamManager.addClient(client);

        sseStreamManager.closeAll();

        // After closeAll, heartbeat should be stopped — adding a new client
        // and advancing timers should not trigger writes
        const newClient = { write: jest.fn(), end: jest.fn() };
        sseStreamManager.addClient(newClient);
        jest.advanceTimersByTime(25_000);
        const heartbeatCalls = newClient.write.mock.calls.filter(
            (c) => typeof c[0] === 'string' && c[0].includes('heartbeat')
        );
        expect(heartbeatCalls.length).toBe(0);
        jest.useRealTimers();
    });

    test('closeAll is safe to call with no clients', () => {
        expect(sseStreamManager.getClientCount()).toBe(0);
        expect(() => sseStreamManager.closeAll()).not.toThrow();
    });
});

describe('Graceful Shutdown — tsdbService.close', () => {
    let tsdbService;
    const path = require('path');
    const os = require('os');
    const fs = require('fs');

    const mockTmpDir = path.join(os.tmpdir(), `agent-monitor-tsdb-shutdown-test-${process.pid}`);
    const mockTmpDbPath = path.join(mockTmpDir, 'tsdb.sqlite');

    beforeAll(() => {
        if (!fs.existsSync(mockTmpDir)) {
            fs.mkdirSync(mockTmpDir, { recursive: true });
        }
    });

    afterAll(() => {
        try { fs.rmSync(mockTmpDir, { recursive: true, force: true }); } catch (_) {}
    });

    beforeEach(() => {
        jest.resetModules();
        jest.mock('better-sqlite3', () => {
            const Real = jest.requireActual('better-sqlite3');
            return jest.fn().mockImplementation((_dbPath, opts) => {
                return new Real(mockTmpDbPath, opts || {});
            });
        });
        tsdbService = require('../src/backend/services/tsdbService');
    });

    test('close() closes the database without error', () => {
        // Verify the db is functional first
        tsdbService.saveSnapshot({ cpu: 10, memory: 20, disk: 30, agents: [], totalAgents: 1, activeAgents: 0 });

        expect(() => tsdbService.close()).not.toThrow();
    });

    test('close() is safe to call multiple times', () => {
        tsdbService.close();
        expect(() => tsdbService.close()).not.toThrow();
    });
});

describe('Graceful Shutdown — taskHubRepository.close', () => {
    let taskHubRepository;

    beforeEach(() => {
        jest.resetModules();
        // taskHubRepository uses lazy init — it only opens db on first getDb() call.
        // Mock the config to return a non-existent db path to avoid side effects.
        jest.mock('../src/backend/config', () => ({
            getTaskHubConfig: () => ({
                dbPath: ':memory:',
            }),
            getServerConfig: jest.fn(),
            getDashboardPollingConfig: jest.fn(),
        }));
        taskHubRepository = require('../src/backend/repositories/taskHubRepository');
    });

    test('close() is safe when db was never opened (lazy init)', () => {
        // db is null initially
        expect(() => taskHubRepository.close()).not.toThrow();
    });
});
