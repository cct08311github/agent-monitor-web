'use strict';

const fs = require('fs');
const { getServerConfig, getAuthConfig, getOpenClawConfig } = require('./index');
const logger = require('../utils/logger');

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
    if (process.env.AUTH_DISABLED === 'true' && process.env.NODE_ENV === 'production') {
        logger.warn('auth_disabled_in_production', { message: 'AUTH_DISABLED=true in production is a critical security risk' });
    }
    if (!process.env.AUTH_DISABLED && !process.env.HUD_CONTROL_TOKEN) {
        logger.warn('control_token_missing', { message: 'HUD_CONTROL_TOKEN not set; control endpoints will reject all requests' });
    }

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
