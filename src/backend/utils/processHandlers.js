'use strict';

const logger = require('./logger');

/**
 * Format a rejection reason into structured log fields.
 * Pure function — safe to unit test without installing handlers.
 */
function formatRejection(reason) {
    if (reason instanceof Error) {
        return { reason: reason.message, name: reason.name, stack: reason.stack };
    }
    if (reason === null) return { reason: 'null', type: 'null' };
    if (reason === undefined) return { reason: 'undefined', type: 'undefined' };
    if (typeof reason === 'object') {
        try {
            return { reason: JSON.stringify(reason).slice(0, 300), type: 'object' };
        } catch (_) {
            // Circular ref, BigInt, toJSON-throws — must not crash the handler
            return { reason: '[object: not serializable]', type: 'object' };
        }
    }
    return { reason: String(reason), type: typeof reason };
}

/**
 * Format an uncaught exception into structured log fields.
 */
function formatException(err) {
    if (err instanceof Error) {
        return { message: err.message, name: err.name, stack: err.stack };
    }
    return { message: String(err), name: typeof err };
}

/**
 * Install process-level error handlers.
 *
 * unhandledRejection: log only — Node warns and may terminate in future
 * versions; let the process manager decide recovery policy.
 *
 * uncaughtException: log and exit(1) so process manager (pm2 / systemd)
 * restarts cleanly rather than running in a corrupt state.
 *
 * @param {{ onExit?: (code: number) => void }} [options]
 */
function installHandlers(options = {}) {
    const onExit = options.onExit ?? process.exit;

    process.on('unhandledRejection', (reason) => {
        logger.error('unhandled_rejection', formatRejection(reason));
    });

    process.on('uncaughtException', (err) => {
        logger.error('uncaught_exception', formatException(err));
        // Defer exit by one tick so buffered stderr has a chance to flush
        // to a pipe (pm2 / systemd). On TTY stderr is sync so this is a no-op.
        setImmediate(() => onExit(1));
    });
}

module.exports = { formatRejection, formatException, installHandlers };
