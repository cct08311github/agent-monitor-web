'use strict';

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
    const payload = {
        ts: new Date().toISOString(),
        level,
        event,
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
