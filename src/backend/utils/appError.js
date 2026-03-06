'use strict';

class AppError extends Error {
    constructor(statusCode, error, message, extras = {}) {
        super(message || error);
        this.name = 'AppError';
        this.statusCode = statusCode;
        this.error = error;
        this.extras = extras;
    }
}

module.exports = AppError;
