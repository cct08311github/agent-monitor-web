'use strict';

const { AsyncLocalStorage } = require('async_hooks');

// Module-level singleton ALS store for request-scoped context.
// requestContext middleware seeds; logger reads.
const store = new AsyncLocalStorage();

module.exports = { store };
