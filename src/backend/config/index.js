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
    const authDisabled = process.env.AUTH_DISABLED === 'true';
    const sessionSecret = process.env.AUTH_SESSION_SECRET;

    // Require secure session secret when auth is enabled (production mode)
    // When AUTH_DISABLED='true', allow fallback secret for testing convenience
    if (!authDisabled) {
        if (!sessionSecret || !sessionSecret.trim()) {
            throw new Error('AUTH_SESSION_SECRET environment variable is required in production');
        }
        return {
            authDisabled: false,
            username: readTrimmedEnv('AUTH_USERNAME', 'admin'),
            passwordHash: readTrimmedEnv('AUTH_PASSWORD_HASH', ''),
            sessionSecret: sessionSecret.trim(),
            sessionTtlHours: readNumber(process.env.AUTH_SESSION_TTL_HOURS, 8),
            controlToken: readTrimmedEnv('HUD_CONTROL_TOKEN', readTrimmedEnv('OPENCLAW_HUD_CONTROL_TOKEN', '')),
        };
    }

    // AUTH_DISABLED=true: allow fallback for test/dev convenience
    return {
        authDisabled: true,
        username: readTrimmedEnv('AUTH_USERNAME', 'admin'),
        passwordHash: readTrimmedEnv('AUTH_PASSWORD_HASH', ''),
        sessionSecret: sessionSecret?.trim() || 'dev-secret-change-in-production',
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
        const match = raw.match(/^GEMINI_API_KEY=["']?([^"'\s#]+)["']?/m);
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

function getTaskHubConfig() {
    const homeDir = os.homedir();
    const dbPath = readTrimmedEnv(
        'TASKHUB_DB_PATH',
        path.join(homeDir, '.openclaw', 'shared', 'projects', 'task-hub', 'data', 'taskhub.db')
    );
    return { dbPath };
}

function getGatewayConfig() {
    return {
        port: readNumber(process.env.GATEWAY_PORT, 18789),
        host: readTrimmedEnv('GATEWAY_HOST', '127.0.0.1'),
    };
}

function getDashboardPollingConfig() {
    return {
        cacheTtlSysMs: readNumber(process.env.DASHBOARD_CACHE_TTL_SYS_MS, 5000),
        cacheTtlAgentsMs: readNumber(process.env.DASHBOARD_CACHE_TTL_AGENTS_MS, 10000),
        cacheTtlCronMs: readNumber(process.env.DASHBOARD_CACHE_TTL_CRON_MS, 30000),
        cacheTtlCooldownsMs: readNumber(process.env.DASHBOARD_CACHE_TTL_COOLDOWNS_MS, 15000),
        pollingIntervalMs: readNumber(process.env.DASHBOARD_POLLING_INTERVAL_MS, 15000),
        tsdbSnapshotIntervalMs: readNumber(process.env.TSDB_SNAPSHOT_INTERVAL_MS, 60000),
    };
}

function getWatchdogConfig() {
    return {
        checkIntervalMs: readNumber(process.env.WATCHDOG_CHECK_INTERVAL_MS, 30000),
        repairCooldownMs: readNumber(process.env.WATCHDOG_REPAIR_COOLDOWN_MS, 180000),
        maxRepairAttempts: readNumber(process.env.WATCHDOG_MAX_REPAIR_ATTEMPTS, 3),
        healthCheckTimeoutMs: readNumber(process.env.WATCHDOG_HEALTH_CHECK_TIMEOUT_MS, 8000),
        repairWaitMs: readNumber(process.env.WATCHDOG_REPAIR_WAIT_MS, 20000),
        restartGracePeriodMs: readNumber(process.env.WATCHDOG_RESTART_GRACE_PERIOD_MS, 45000),
        telegramCooldownMs: readNumber(process.env.WATCHDOG_TELEGRAM_COOLDOWN_MS, 300000),
        geminiTimeoutMs: readNumber(process.env.WATCHDOG_GEMINI_TIMEOUT_MS, 180000),
    };
}

module.exports = {
    getProjectRoot,
    getServerConfig,
    getOpenClawConfig,
    getAuthConfig,
    getOptimizeConfig,
    getTaskHubConfig,
    getGatewayConfig,
    getDashboardPollingConfig,
    getWatchdogConfig,
};
