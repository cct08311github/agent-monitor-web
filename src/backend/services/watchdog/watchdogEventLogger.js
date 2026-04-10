'use strict';

const fs = require('fs');
const path = require('path');
const logger = require('../../utils/logger');

function fmtTime(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
}

function createEventLogger({ state, CONFIG }) {
    function ensureLogDir() {
        if (!fs.existsSync(CONFIG.logDir)) {
            fs.mkdirSync(CONFIG.logDir, { recursive: true });
        }
    }

    function log(level, msg, details = {}) {
        const entry = {
            ts: new Date().toISOString(),
            tsLocal: fmtTime(),
            level,
            msg,
            ...details,
        };
        const loggerLevel = level === 'err' ? 'error' : (level === 'warn' ? 'warn' : 'info');
        logger[loggerLevel]('gateway_watchdog', {
            msg,
            watchdogLevel: level,
            details: Object.keys(details).length ? details : undefined,
        });

        // Add to in-memory events (keep last 100)
        state.events.push(entry);
        /* istanbul ignore next */
        if (state.events.length > 100) state.events.shift();

        // Write to daily log file
        try {
            ensureLogDir();
            const d = new Date();
            const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            const logFile = path.join(CONFIG.logDir, `watchdog-${dateStr}.jsonl`);
            fs.promises.appendFile(logFile, JSON.stringify(entry) + '\n', 'utf8').catch(writeErr => {
                logger.error('gateway_watchdog_log_async_write_failed', {
                    details: logger.toErrorFields(writeErr),
                });
            });
        } catch (e) {
            logger.error('gateway_watchdog_log_write_failed', {
                details: logger.toErrorFields(e),
            });
        }
    }

    return { log };
}

module.exports = { createEventLogger, fmtTime };
