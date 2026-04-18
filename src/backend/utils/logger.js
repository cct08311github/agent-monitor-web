'use strict';

const { store } = require('./requestStore');

function toErrorFields(err) {
    if (!err) return undefined;
    const isProduction = process.env.NODE_ENV === 'production';
    return {
        message: err.message,
        name: err.name,
        stack: isProduction ? undefined : err.stack,
    };
}

function emit(level, event, fields = {}) {
    const ctx = store.getStore();
    const payload = {
        ts: new Date().toISOString(),
        level,
        event,
        // ALS fallback: inject requestId from async-context if caller didn't
        // pass one. fields.requestId === undefined means unspecified;
        // an explicit null/'' from caller is intentionally respected.
        // Falsy ctx.requestId (pathological seeding) is treated as "no id".
        ...(ctx && ctx.requestId && fields.requestId === undefined ? { requestId: ctx.requestId } : {}),
        ...fields,
    };

    const line = JSON.stringify(payload);
    if (level === 'error') {
        console.error(line);
        return;
    }
    console.log(line);
}

function info(event, fields) {
    emit('info', event, fields);
}

function warn(event, fields) {
    emit('warn', event, fields);
}

function error(event, fields) {
    emit('error', event, fields);
}

module.exports = {
    info,
    warn,
    error,
    toErrorFields,
};
