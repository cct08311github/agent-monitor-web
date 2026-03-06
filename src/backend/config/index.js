'use strict';

const os = require('os');
const path = require('path');
const fs = require('fs');

const PROJECT_ROOT = path.resolve(__dirname, '../../..');

function readNumber(value, fallback) {
    const num = Number(value);
    return Number.isFinite(num) && num > 0 ? num : fallback;
}

function readTrimmedEnv(name, fallback = '') {
    const value = process.env[name];
    return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function getProjectRoot() {
    return PROJECT_ROOT;
}

function getServerConfig() {
    return {
        port: readNumber(process.env.PORT, 3001),
        certKeyPath: readTrimmedEnv('HTTPS_KEY_PATH', path.join(PROJECT_ROOT, 'cert', 'key.pem')),
        certCertPath: readTrimmedEnv('HTTPS_CERT_PATH', path.join(PROJECT_ROOT, 'cert', 'cert.pem')),
    };
}

function getOpenClawConfig() {
    const homeDir = os.homedir();
    const root = readTrimmedEnv('OPENCLAW_ROOT', path.join(homeDir, '.openclaw'));
    return {
        homeDir,
        root,
        binPath: readTrimmedEnv('OPENCLAW_BIN', path.join(root, 'bin', 'openclaw')),
        envPath: readTrimmedEnv('OPENCLAW_ENV_PATH', path.join(root, '.env')),
        agentsRoot: path.join(root, 'agents'),
        workspaceMainRoot: path.join(root, 'workspace-main'),
        configPath: path.join(root, 'openclaw.json'),
        cronJobsPath: path.join(root, 'cron', 'jobs.json'),
        notionSyncScriptPath: path.join(root, 'workspace-main', 'tools', 'smart_notion_sync.py'),
    };
}

function getAuthConfig() {
    return {
        authDisabled: process.env.AUTH_DISABLED === 'true',
        username: readTrimmedEnv('AUTH_USERNAME', 'admin'),
        passwordHash: readTrimmedEnv('AUTH_PASSWORD_HASH', ''),
        sessionSecret: readTrimmedEnv('AUTH_SESSION_SECRET', 'dev-secret-change-in-production'),
        sessionTtlHours: readNumber(process.env.AUTH_SESSION_TTL_HOURS, 8),
        controlToken: readTrimmedEnv('HUD_CONTROL_TOKEN', readTrimmedEnv('OPENCLAW_HUD_CONTROL_TOKEN', '')),
    };
}

function readGeminiApiKey() {
    const direct = readTrimmedEnv('GEMINI_API_KEY', '');
    if (direct) return direct;

    try {
        const { envPath } = getOpenClawConfig();
        const raw = fs.readFileSync(envPath, 'utf8');
        const match = raw.match(/^GEMINI_API_KEY=(.+)$/m);
        return match ? match[1].trim() : '';
    } catch (_) {
        return '';
    }
}

function getOptimizeConfig() {
    const openclaw = getOpenClawConfig();
    return {
        projectPath: readTrimmedEnv('PROJECT_PATH', PROJECT_ROOT),
        plansDir: readTrimmedEnv('PLANS_DIR', path.join(PROJECT_ROOT, 'docs', 'plans')),
        geminiApiKey: readGeminiApiKey(),
        telegramChannel: readTrimmedEnv('OPENCLAW_NOTIFY_CHANNEL', 'telegram'),
        telegramTarget: readTrimmedEnv('OPENCLAW_NOTIFY_TARGET', '-1003873859338'),
        openclawBinPath: openclaw.binPath,
    };
}

module.exports = {
    getProjectRoot,
    getServerConfig,
    getOpenClawConfig,
    getAuthConfig,
    getOptimizeConfig,
};
