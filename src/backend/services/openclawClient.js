'use strict';

const { execFile, spawn } = require('child_process');
const util = require('util');
const { getOpenClawConfig } = require('../config');

function getBinaryPath() {
    return getOpenClawConfig().binPath;
}

function getExecFilePromise() {
    if (typeof execFile !== 'function') throw new TypeError('child_process.execFile is not available');
    return util.promisify(execFile);
}

async function runArgs(args, options = {}) {
    const execOptions = { ...options };
    delete execOptions.binPath;
    return getExecFilePromise()(options.binPath || getBinaryPath(), args, execOptions);
}

function execArgs(args, callback, options = {}) {
    return execFile(options.binPath || getBinaryPath(), args, callback);
}

function spawnArgs(args, options = {}) {
    const spawnOptions = { ...options };
    delete spawnOptions.binPath;
    return spawn(options.binPath || getBinaryPath(), args, spawnOptions);
}

module.exports = {
    getBinaryPath,
    runArgs,
    execArgs,
    spawnArgs,
};
