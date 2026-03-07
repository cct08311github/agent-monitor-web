'use strict';

const crypto = require('crypto');

function getRequestId(req) {
    const inbound = req.get('x-request-id');
    if (inbound && typeof inbound === 'string' && inbound.trim()) {
        return inbound.trim();
    }
    if (typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function requestContext(req, res, next) {
    const requestId = getRequestId(req);
    req.requestId = requestId;
    res.locals.requestId = requestId;
    res.setHeader('x-request-id', requestId);
    next();
}

module.exports = requestContext;
