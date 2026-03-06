'use strict';

function ok(payload = {}) {
    return { success: true, ...payload };
}

function fail(error, extras = {}) {
    return { success: false, error, ...extras };
}

module.exports = {
    ok,
    fail,
};
