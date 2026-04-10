'use strict';

const fs = require('fs');
const { getServerConfig, getOpenClawConfig, getTaskHubConfig, getAuthConfig } = require('../config');
const { validateStartup } = require('../config/startup');

function checkFileDependency(filePath, label, required = true) {
    if (!filePath) {
        return { name: label, status: required ? 'missing' : 'disabled' };
    }

    if (!filePath.startsWith('/')) {
        return { name: label, status: 'configured' };
    }

    if (!fs.existsSync(filePath)) {
        return { name: label, status: required ? 'missing' : 'degraded' };
    }

    try {
        fs.accessSync(filePath, fs.constants.R_OK);
        return { name: label, status: 'ready' };
    } catch (_) {
        return { name: label, status: 'unreadable' };
    }
}

function getDependencyHealth() {
    const server = getServerConfig();
    const openclaw = getOpenClawConfig();
    const taskHub = getTaskHubConfig();
    const auth = getAuthConfig();

    return {
        httpsKey: checkFileDependency(server.certKeyPath, 'https_key'),
        httpsCert: checkFileDependency(server.certCertPath, 'https_cert'),
        openclawBin: checkFileDependency(openclaw.binPath, 'openclaw_bin'),
        openclawConfig: checkFileDependency(openclaw.configPath, 'openclaw_config', false),
        taskHubDb: checkFileDependency(taskHub.dbPath, 'taskhub_db', false),
        auth: {
            name: 'auth',
            status: auth.authDisabled || auth.passwordHash ? 'ready' : 'missing',
        },
    };
}

function summarizeDependencyState(dependencies) {
    const statuses = Object.values(dependencies).map((dependency) => dependency.status);
    if (statuses.some((status) => status === 'missing' || status === 'unreadable')) return 'not_ready';
    if (statuses.some((status) => status === 'degraded')) return 'degraded';
    return 'ready';
}

function getLivenessPayload() {
    return {
        status: 'alive',
        ts: new Date().toISOString(),
        pid: process.pid,
        uptimeSec: Math.floor(process.uptime()),
    };
}

function getReadinessPayload() {
    const startup = validateStartup();
    const dependencies = getDependencyHealth();
    const dependencyState = summarizeDependencyState(dependencies);
    const ready = startup.ok && dependencyState !== 'not_ready';

    return {
        status: ready ? 'ready' : 'not_ready',
        ready,
        startup,
        dependencies,
        ts: new Date().toISOString(),
    };
}

module.exports = {
    getDependencyHealth,
    getLivenessPayload,
    getReadinessPayload,
};
