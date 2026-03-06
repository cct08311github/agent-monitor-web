'use strict';

function ok(payload = {}) {
    return { success: true, ...payload };
}

function fail(error, extras = {}) {
    return { success: false, error, ...extras };
}

function sendOk(res, payload = {}, statusCode = 200) {
    return res.status(statusCode).json(ok(payload));
}

function sendFail(res, statusCode, error, extras = {}) {
    return res.status(statusCode).json(fail(error, extras));
}

module.exports = {
    ok,
    fail,
    sendOk,
    sendFail,
};
