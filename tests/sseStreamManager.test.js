'use strict';

describe('sseStreamManager', () => {
    let sseStreamManager;

    function makeRes(writeFn) {
        return {
            write: writeFn || jest.fn(),
            end: jest.fn(),
        };
    }

    beforeEach(() => {
        jest.useFakeTimers();
        jest.resetModules();
        sseStreamManager = require('../src/backend/services/sseStreamManager');
    });

    afterEach(() => {
        sseStreamManager.closeAll();
        jest.useRealTimers();
    });

    // -------------------------------------------------------------------------
    // addClient
    // -------------------------------------------------------------------------
    describe('addClient', () => {
        it('returns true and adds the client', () => {
            const res = makeRes();
            expect(sseStreamManager.addClient(res)).toBe(true);
            expect(sseStreamManager.getClientCount()).toBe(1);
        });

        it('returns false and does not add when at MAX_SSE_CLIENTS (20)', () => {
            for (let i = 0; i < 20; i++) {
                expect(sseStreamManager.addClient(makeRes())).toBe(true);
            }
            const overflow = makeRes();
            expect(sseStreamManager.addClient(overflow)).toBe(false);
            expect(sseStreamManager.getClientCount()).toBe(20);
        });

        it('allows adding the 20th client but not the 21st', () => {
            for (let i = 0; i < 19; i++) {
                sseStreamManager.addClient(makeRes());
            }
            expect(sseStreamManager.addClient(makeRes())).toBe(true);
            expect(sseStreamManager.addClient(makeRes())).toBe(false);
        });
    });

    // -------------------------------------------------------------------------
    // removeClient
    // -------------------------------------------------------------------------
    describe('removeClient', () => {
        it('removes a previously added client', () => {
            const res = makeRes();
            sseStreamManager.addClient(res);
            sseStreamManager.removeClient(res);
            expect(sseStreamManager.getClientCount()).toBe(0);
        });

        it('is a no-op for a client that was never added', () => {
            sseStreamManager.removeClient(makeRes());
            expect(sseStreamManager.getClientCount()).toBe(0);
        });

        it('only removes the targeted client', () => {
            const a = makeRes();
            const b = makeRes();
            sseStreamManager.addClient(a);
            sseStreamManager.addClient(b);
            sseStreamManager.removeClient(a);
            expect(sseStreamManager.getClientCount()).toBe(1);
        });
    });

    // -------------------------------------------------------------------------
    // getClientCount
    // -------------------------------------------------------------------------
    describe('getClientCount', () => {
        it('returns 0 when no clients are connected', () => {
            expect(sseStreamManager.getClientCount()).toBe(0);
        });

        it('tracks additions and removals accurately', () => {
            const a = makeRes();
            const b = makeRes();
            sseStreamManager.addClient(a);
            expect(sseStreamManager.getClientCount()).toBe(1);
            sseStreamManager.addClient(b);
            expect(sseStreamManager.getClientCount()).toBe(2);
            sseStreamManager.removeClient(a);
            expect(sseStreamManager.getClientCount()).toBe(1);
        });
    });

    // -------------------------------------------------------------------------
    // broadcast
    // -------------------------------------------------------------------------
    describe('broadcast', () => {
        it('does nothing when there are no clients', () => {
            // Should not throw
            expect(() => sseStreamManager.broadcast({ ok: true })).not.toThrow();
        });

        it('writes the correct SSE data frame to each client', () => {
            const a = makeRes();
            const b = makeRes();
            sseStreamManager.addClient(a);
            sseStreamManager.addClient(b);

            const data = { type: 'update', value: 42 };
            sseStreamManager.broadcast(data);

            const expected = `data: ${JSON.stringify(data)}\n\n`;
            expect(a.write).toHaveBeenCalledWith(expected);
            expect(b.write).toHaveBeenCalledWith(expected);
        });

        it('removes a client whose write throws', () => {
            const good = makeRes();
            const bad = makeRes(jest.fn(() => { throw new Error('broken pipe'); }));
            sseStreamManager.addClient(good);
            sseStreamManager.addClient(bad);

            sseStreamManager.broadcast({ x: 1 });

            expect(sseStreamManager.getClientCount()).toBe(1);
            // The good client should still have received the message
            expect(good.write).toHaveBeenCalledTimes(1);
        });

        it('removes all failing clients in a single broadcast', () => {
            const bad1 = makeRes(jest.fn(() => { throw new Error('gone'); }));
            const bad2 = makeRes(jest.fn(() => { throw new Error('gone'); }));
            sseStreamManager.addClient(bad1);
            sseStreamManager.addClient(bad2);

            sseStreamManager.broadcast({ x: 1 });
            expect(sseStreamManager.getClientCount()).toBe(0);
        });

        it('serialises the data payload as JSON', () => {
            const res = makeRes();
            sseStreamManager.addClient(res);

            sseStreamManager.broadcast({ arr: [1, 2], nested: { a: 'b' } });
            const call = res.write.mock.calls[0][0];
            expect(call).toContain(JSON.stringify({ arr: [1, 2], nested: { a: 'b' } }));
        });
    });

    // -------------------------------------------------------------------------
    // broadcastAlert
    // -------------------------------------------------------------------------
    describe('broadcastAlert', () => {
        it('does nothing when there are no clients', () => {
            expect(() => sseStreamManager.broadcastAlert([{ id: 1 }])).not.toThrow();
        });

        it('does nothing when alerts is null', () => {
            const res = makeRes();
            sseStreamManager.addClient(res);
            sseStreamManager.broadcastAlert(null);
            expect(res.write).not.toHaveBeenCalled();
        });

        it('does nothing when alerts is an empty array', () => {
            const res = makeRes();
            sseStreamManager.addClient(res);
            sseStreamManager.broadcastAlert([]);
            expect(res.write).not.toHaveBeenCalled();
        });

        it('writes the correct SSE event frame with named event type', () => {
            const res = makeRes();
            sseStreamManager.addClient(res);

            const alerts = [{ id: 'a1', level: 'warn' }];
            sseStreamManager.broadcastAlert(alerts);

            const expected = `event: alert\ndata: ${JSON.stringify({ alerts })}\n\n`;
            expect(res.write).toHaveBeenCalledWith(expected);
        });

        it('sends to all connected clients', () => {
            const a = makeRes();
            const b = makeRes();
            sseStreamManager.addClient(a);
            sseStreamManager.addClient(b);

            sseStreamManager.broadcastAlert([{ id: 'x' }]);
            expect(a.write).toHaveBeenCalledTimes(1);
            expect(b.write).toHaveBeenCalledTimes(1);
        });

        it('removes a client whose write throws during alert broadcast', () => {
            const good = makeRes();
            const bad = makeRes(jest.fn(() => { throw new Error('closed'); }));
            sseStreamManager.addClient(good);
            sseStreamManager.addClient(bad);

            sseStreamManager.broadcastAlert([{ id: 'y' }]);

            expect(sseStreamManager.getClientCount()).toBe(1);
            expect(good.write).toHaveBeenCalledTimes(1);
        });
    });

    // -------------------------------------------------------------------------
    // startHeartbeat / stopHeartbeat
    // -------------------------------------------------------------------------
    describe('startHeartbeat', () => {
        it('does not send a heartbeat immediately upon start', () => {
            const res = makeRes();
            sseStreamManager.addClient(res);
            sseStreamManager.startHeartbeat();
            expect(res.write).not.toHaveBeenCalled();
        });

        it('sends a heartbeat comment after 20 000 ms', () => {
            const res = makeRes();
            sseStreamManager.addClient(res);
            sseStreamManager.startHeartbeat();

            jest.advanceTimersByTime(20_000);

            expect(res.write).toHaveBeenCalledTimes(1);
            expect(res.write.mock.calls[0][0]).toMatch(/^: heartbeat \d+\n\n$/);
        });

        it('sends heartbeats repeatedly on every 20 000 ms interval', () => {
            const res = makeRes();
            sseStreamManager.addClient(res);
            sseStreamManager.startHeartbeat();

            jest.advanceTimersByTime(60_000);
            expect(res.write).toHaveBeenCalledTimes(3);
        });

        it('is idempotent — calling start twice does not double the heartbeat rate', () => {
            const res = makeRes();
            sseStreamManager.addClient(res);
            sseStreamManager.startHeartbeat();
            sseStreamManager.startHeartbeat();

            jest.advanceTimersByTime(20_000);
            expect(res.write).toHaveBeenCalledTimes(1);
        });

        it('skips the write when there are no clients', () => {
            sseStreamManager.startHeartbeat();
            jest.advanceTimersByTime(20_000);
            // No clients — must not throw; client count stays 0
            expect(sseStreamManager.getClientCount()).toBe(0);
        });

        it('removes clients that throw during heartbeat', () => {
            const bad = makeRes(jest.fn(() => { throw new Error('gone'); }));
            sseStreamManager.addClient(bad);
            sseStreamManager.startHeartbeat();

            jest.advanceTimersByTime(20_000);
            expect(sseStreamManager.getClientCount()).toBe(0);
        });
    });

    describe('stopHeartbeat', () => {
        it('stops subsequent heartbeat writes', () => {
            const res = makeRes();
            sseStreamManager.addClient(res);
            sseStreamManager.startHeartbeat();
            sseStreamManager.stopHeartbeat();

            jest.advanceTimersByTime(40_000);
            expect(res.write).not.toHaveBeenCalled();
        });

        it('is safe to call when no heartbeat is running', () => {
            expect(() => sseStreamManager.stopHeartbeat()).not.toThrow();
        });

        it('allows restarting the heartbeat after a stop', () => {
            const res = makeRes();
            sseStreamManager.addClient(res);
            sseStreamManager.startHeartbeat();
            sseStreamManager.stopHeartbeat();
            sseStreamManager.startHeartbeat();

            jest.advanceTimersByTime(20_000);
            expect(res.write).toHaveBeenCalledTimes(1);
        });
    });

    // -------------------------------------------------------------------------
    // closeAll
    // -------------------------------------------------------------------------
    describe('closeAll', () => {
        it('sends server-shutdown event and ends each client', () => {
            const a = makeRes();
            const b = makeRes();
            sseStreamManager.addClient(a);
            sseStreamManager.addClient(b);

            sseStreamManager.closeAll();

            const expected = `event: server-shutdown\ndata: ${JSON.stringify({ reason: 'server_restart' })}\n\n`;
            expect(a.write).toHaveBeenCalledWith(expected);
            expect(b.write).toHaveBeenCalledWith(expected);
            expect(a.end).toHaveBeenCalled();
            expect(b.end).toHaveBeenCalled();
        });

        it('clears all clients after close', () => {
            sseStreamManager.addClient(makeRes());
            sseStreamManager.addClient(makeRes());
            sseStreamManager.closeAll();
            expect(sseStreamManager.getClientCount()).toBe(0);
        });

        it('stops the heartbeat when closing', () => {
            const res = makeRes();
            sseStreamManager.addClient(res);
            sseStreamManager.startHeartbeat();
            sseStreamManager.closeAll();

            // Advance timers — heartbeat should NOT fire after closeAll
            jest.advanceTimersByTime(40_000);
            // The only write was the shutdown event; no heartbeat writes
            expect(res.write).toHaveBeenCalledTimes(1);
            expect(res.write.mock.calls[0][0]).toContain('server-shutdown');
        });

        it('is safe to call when no clients are connected', () => {
            expect(() => sseStreamManager.closeAll()).not.toThrow();
        });

        it('silently swallows errors from clients that are already gone', () => {
            const broken = {
                write: jest.fn(() => { throw new Error('already gone'); }),
                end: jest.fn(() => { throw new Error('already gone'); }),
            };
            sseStreamManager.addClient(broken);
            expect(() => sseStreamManager.closeAll()).not.toThrow();
            expect(sseStreamManager.getClientCount()).toBe(0);
        });

        it('new clients can be added after closeAll', () => {
            sseStreamManager.addClient(makeRes());
            sseStreamManager.closeAll();

            const fresh = makeRes();
            expect(sseStreamManager.addClient(fresh)).toBe(true);
            expect(sseStreamManager.getClientCount()).toBe(1);
        });
    });
});
