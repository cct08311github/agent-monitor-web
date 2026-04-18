'use strict';

const {
    formatRejection,
    formatException,
    installHandlers,
} = require('../src/backend/utils/processHandlers');

describe('processHandlers.formatRejection', () => {
    it('Error instance → message + name + stack', () => {
        const err = new TypeError('bad input');
        const result = formatRejection(err);
        expect(result.reason).toBe('bad input');
        expect(result.name).toBe('TypeError');
        expect(typeof result.stack).toBe('string');
    });

    it('string → reason + type=string', () => {
        expect(formatRejection('oops')).toEqual({ reason: 'oops', type: 'string' });
    });

    it('null → reason=null + type=null', () => {
        expect(formatRejection(null)).toEqual({ reason: 'null', type: 'null' });
    });

    it('undefined → reason=undefined + type=undefined', () => {
        expect(formatRejection(undefined)).toEqual({ reason: 'undefined', type: 'undefined' });
    });

    it('plain object → JSON stringified, truncated to 300 chars', () => {
        const big = { code: 500, detail: 'x'.repeat(500) };
        const result = formatRejection(big);
        expect(result.type).toBe('object');
        expect(result.reason.length).toBeLessThanOrEqual(300);
    });

    it('number → String coercion + type=number', () => {
        expect(formatRejection(42)).toEqual({ reason: '42', type: 'number' });
    });
});

describe('processHandlers.formatException', () => {
    it('Error instance → message + name + stack', () => {
        const err = new RangeError('out of range');
        const result = formatException(err);
        expect(result.message).toBe('out of range');
        expect(result.name).toBe('RangeError');
        expect(typeof result.stack).toBe('string');
    });

    it('non-Error → String(err) + typeof name', () => {
        expect(formatException('crash')).toEqual({ message: 'crash', name: 'string' });
    });
});

describe('processHandlers.installHandlers', () => {
    let originalUnhandled;
    let originalUncaught;
    let errSpy;

    beforeEach(() => {
        // Save existing handlers and remove them to avoid pollution
        originalUnhandled = process.listeners('unhandledRejection').slice();
        originalUncaught = process.listeners('uncaughtException').slice();
        process.removeAllListeners('unhandledRejection');
        process.removeAllListeners('uncaughtException');
        // Silence logger output
        errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        process.removeAllListeners('unhandledRejection');
        process.removeAllListeners('uncaughtException');
        originalUnhandled.forEach((fn) => process.on('unhandledRejection', fn));
        originalUncaught.forEach((fn) => process.on('uncaughtException', fn));
        errSpy.mockRestore();
    });

    it('installs unhandledRejection + uncaughtException listeners', () => {
        installHandlers();
        expect(process.listeners('unhandledRejection').length).toBe(1);
        expect(process.listeners('uncaughtException').length).toBe(1);
    });

    it('unhandledRejection listener logs without exiting', () => {
        const onExit = jest.fn();
        installHandlers({ onExit });
        process.emit('unhandledRejection', new Error('test reject'), Promise.resolve());
        expect(errSpy).toHaveBeenCalled();
        expect(onExit).not.toHaveBeenCalled();
    });

    it('uncaughtException listener logs and calls onExit(1)', () => {
        const onExit = jest.fn();
        installHandlers({ onExit });
        process.emit('uncaughtException', new Error('boom'));
        expect(errSpy).toHaveBeenCalled();
        expect(onExit).toHaveBeenCalledWith(1);
    });
});
