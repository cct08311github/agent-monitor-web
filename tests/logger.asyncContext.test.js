'use strict';

const { store } = require('../src/backend/utils/requestStore');
const logger = require('../src/backend/utils/logger');

function captureLog(fn) {
    const logs = [];
    const origLog = console.log;
    const origError = console.error;
    console.log = (line) => logs.push(line);
    console.error = (line) => logs.push(line);
    try {
        fn();
    } finally {
        // Guarantee restoration even if fn() throws, otherwise a single
        // failing test would permanently patch console globally and swallow
        // logs in every subsequent test of the Jest worker.
        console.log = origLog;
        console.error = origError;
    }
    return logs.map((l) => JSON.parse(l));
}

afterEach(() => {
    jest.restoreAllMocks();
});

describe('logger ALS auto-inject', () => {
    it('does not include requestId when no ALS context', () => {
        const [entry] = captureLog(() => logger.info('test.event'));
        expect(entry.requestId).toBeUndefined();
    });

    it('auto-injects requestId from ALS context', (done) => {
        store.run({ requestId: 'r1' }, () => {
            const [entry] = captureLog(() => logger.info('test.event'));
            expect(entry.requestId).toBe('r1');
            done();
        });
    });

    it('caller-explicit requestId wins over ALS value', (done) => {
        store.run({ requestId: 'r1' }, () => {
            const [entry] = captureLog(() => logger.info('test.event', { requestId: 'explicit' }));
            expect(entry.requestId).toBe('explicit');
            done();
        });
    });

    it('concurrent store.run invocations do not mix contexts', (done) => {
        let results = [];
        let pending = 2;

        function check() {
            pending--;
            if (pending === 0) {
                const [entryA] = results.filter((e) => e._tag === 'A');
                const [entryB] = results.filter((e) => e._tag === 'B');
                expect(entryA.requestId).toBe('ctx-A');
                expect(entryB.requestId).toBe('ctx-B');
                done();
            }
        }

        store.run({ requestId: 'ctx-A' }, () => {
            setImmediate(() => {
                const [entry] = captureLog(() => logger.info('event.A', { _tag: 'A' }));
                results.push(entry);
                check();
            });
        });

        store.run({ requestId: 'ctx-B' }, () => {
            setImmediate(() => {
                const [entry] = captureLog(() => logger.info('event.B', { _tag: 'B' }));
                results.push(entry);
                check();
            });
        });
    });

    it('nested store.run — inner context overrides outer while active', (done) => {
        store.run({ requestId: 'outer' }, () => {
            store.run({ requestId: 'inner' }, () => {
                const [entry] = captureLog(() => logger.info('nested.event'));
                expect(entry.requestId).toBe('inner');
                done();
            });
        });
    });

    it('after store.run callback returns, log outside context has no requestId', (done) => {
        store.run({ requestId: 'r-scope' }, () => {
            // inside — fine
        });
        // outside: ALS has no store
        setImmediate(() => {
            const [entry] = captureLog(() => logger.warn('after.scope'));
            expect(entry.requestId).toBeUndefined();
            done();
        });
    });
});
