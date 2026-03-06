'use strict';

const fs = require('fs');
const { getServerConfig, getAuthConfig, getOpenClawConfig } = require('./index');

function checkReadableFile(filePath, label, errors) {
    if (!fs.existsSync(filePath)) {
        errors.push(`${label} not found: ${filePath}`);
        return;
    }

    try {
        fs.accessSync(filePath, fs.constants.R_OK);
    } catch (_) {
        errors.push(`${label} is not readable: ${filePath}`);
    }
}

function validateStartup() {
    const errors = [];
    const server = getServerConfig();
    const auth = getAuthConfig();
    const openclaw = getOpenClawConfig();

    checkReadableFile(server.certKeyPath, 'HTTPS key', errors);
    checkReadableFile(server.certCertPath, 'HTTPS certificate', errors);

    if (!openclaw.binPath) {
        errors.push('OpenClaw binary path is empty');
    } else if (openclaw.binPath.startsWith('/')) {
        checkReadableFile(openclaw.binPath, 'OpenClaw binary', errors);
    }

    if (!auth.authDisabled && !auth.passwordHash) {
        errors.push('AUTH_PASSWORD_HASH is required when AUTH_DISABLED is false');
    }

    return {
        ok: errors.length === 0,
        errors,
    };
}

module.exports = {
    validateStartup,
};
