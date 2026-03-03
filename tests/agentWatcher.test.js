// agentWatcherService tests - chokidar is already mocked via moduleNameMapper

let service;

beforeEach(() => {
    jest.resetModules();
    service = require('../src/backend/services/agentWatcherService');
    // Reset watcher state for each test
    if (service.watcher) {
        service.watcher.close();
        service.watcher = null;
    }
});

describe('AgentWatcherService', () => {
    it('starts watching and creates a watcher', () => {
        service.start();
        expect(service.watcher).toBeTruthy();
    });

    it('start is idempotent - calling twice keeps the same watcher', () => {
        service.start();
        const firstWatcher = service.watcher;
        service.start();
        expect(service.watcher).toBe(firstWatcher);
    });

    it('stop clears the watcher', () => {
        service.start();
        service.stop();
        expect(service.watcher).toBeNull();
    });

    it('stop is safe to call when not started', () => {
        expect(() => service.stop()).not.toThrow();
    });

    it('emitChange emits an event with timestamp and source', (done) => {
        service.once('state_update', (data) => {
            expect(data).toHaveProperty('timestamp');
            expect(data).toHaveProperty('source', '/some/file.jsonl');
            done();
        });
        service.emitChange('state_update', '/some/file.jsonl');
    });

    it('watcher emits state_update on add event', (done) => {
        service.once('state_update', (data) => {
            expect(data.source).toContain('test.jsonl');
            done();
        });
        service.start();
        // Simulate chokidar firing an 'add' event
        service.watcher.emit('add', '/agents/main/sessions/test.jsonl');
    });

    it('watcher emits state_update on change event', (done) => {
        service.once('state_update', (data) => {
            expect(data.source).toContain('changed.jsonl');
            done();
        });
        service.start();
        service.watcher.emit('change', '/agents/main/sessions/changed.jsonl');
    });
});
