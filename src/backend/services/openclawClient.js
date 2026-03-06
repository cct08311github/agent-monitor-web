'use strict';

const { exec, execFile, spawn } = require('child_process');
const util = require('util');
const { getOpenClawConfig } = require('../config');

function getBinaryPath() {
    return getOpenClawConfig().binPath;
}

function getExecPromise() {
    if (typeof exec !== 'function') throw new TypeError('child_process.exec is not available');
    return util.promisify(exec);
}

function getExecFilePromise() {
    if (typeof execFile !== 'function') throw new TypeError('child_process.execFile is not available');
    return util.promisify(execFile);
}

function normalizeCommand(command) {
    if (typeof command !== 'string') return command;
    return command.startsWith('openclaw')
        ? command.replace(/^openclaw\b/, getBinaryPath())
        : command;
}

async function runCommand(command, options = {}) {
    const execOptions = options.execOptions || {};
    if (Object.keys(execOptions).length === 0) {
        return getExecPromise()(normalizeCommand(command));
    }
    return getExecPromise()(normalizeCommand(command), execOptions);
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
    normalizeCommand,
    runCommand,
    runArgs,
    execArgs,
    spawnArgs,
};
