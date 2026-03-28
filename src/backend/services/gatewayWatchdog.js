/**
 * Gateway Watchdog Service — 自動修復機制 (Orchestrator)
 *
 * Coordinates health checking, auto-repair, Telegram notification,
 * and event logging via focused sub-modules.
 */

const path = require('path');
const { getOpenClawConfig, getOptimizeConfig, getProjectRoot, getGatewayConfig, getWatchdogConfig } = require('../config');
const logger = require('../utils/logger');

const { createEventLogger, fmtTime } = require('./watchdog/watchdogEventLogger');
const { createHealthChecker } = require('./watchdog/gatewayHealthChecker');
const { createNotifier } = require('./watchdog/watchdogNotifier');
const { createRepairService } = require('./watchdog/gatewayRepairService');

// --- Config Loading ---
function getFallbackOpenClawConfig() {
    const homeDir = process.env.HOME || '/tmp';
    const root = path.join(homeDir, '.openclaw');
    return {
        root,
        binPath: path.join(root, 'bin', 'openclaw'),
        configPath: path.join(root, 'config.json'),
    };
}

function getFallbackOptimizeConfig() {
    return {
        telegramChannel: '',
        telegramTarget: '',
    };
}

function loadWatchdogConfig() {
    try {
        return {
            openclawConfig: getOpenClawConfig(),
            optimizeConfig: getOptimizeConfig(),
        };
    } catch (error) {
        logger.error('gateway_watchdog_config_load_failed', {
            details: logger.toErrorFields(error),
        });
        return {
            openclawConfig: getFallbackOpenClawConfig(),
            optimizeConfig: getFallbackOptimizeConfig(),
        };
    }
}

const loadedConfig = loadWatchdogConfig();
const openclawConfig = loadedConfig.openclawConfig;
const optimizeConfig = loadedConfig.optimizeConfig;
const OPENCLAW_PATH = openclawConfig.binPath;
const gatewayConfig = getGatewayConfig();
const GATEWAY_PORT = gatewayConfig.port;
const GATEWAY_HOST = gatewayConfig.host;
const OPENCLAW_CONFIG_PATH = openclawConfig.configPath;
const OPENCLAW_LOG_DIR = path.join(openclawConfig.root, 'logs');

// --- Configuration (from centralized config module) ---
const watchdogCfg = getWatchdogConfig();
const CONFIG = {
    checkIntervalMs: watchdogCfg.checkIntervalMs,
    repairCooldownMs: watchdogCfg.repairCooldownMs,
    maxRepairAttempts: watchdogCfg.maxRepairAttempts,
    healthCheckTimeoutMs: watchdogCfg.healthCheckTimeoutMs,
    repairWaitMs: watchdogCfg.repairWaitMs,
    restartGracePeriodMs: watchdogCfg.restartGracePeriodMs,
    telegramCooldownMs: watchdogCfg.telegramCooldownMs,
    geminiTimeoutMs: watchdogCfg.geminiTimeoutMs,
    logDir: path.join(getProjectRoot(), 'logs', 'watchdog'),
};

// --- State ---
const state = {
    isRunning: false,
    timer: null,
    repairAttempts: 0,
    lastRepairTime: 0,
    lastRestartTime: 0,
    lastTelegramTime: 0,
    lastHealthy: Date.now(),
    consecutiveFailures: 0,
    totalRepairs: 0,
    totalAlerts: 0,
    currentStatus: 'unknown',
    events: [],
    repairHistory: [],
};

// --- Wire sub-modules ---
const { log } = createEventLogger({ state, CONFIG });
const { checkGatewayHealth, checkOpenClawStatus } = createHealthChecker({ GATEWAY_HOST, GATEWAY_PORT, OPENCLAW_PATH, CONFIG });
const { sendTelegramNotification } = createNotifier({ state, CONFIG, OPENCLAW_PATH, GATEWAY_PORT, optimizeConfig, log });
const { attemptRepair } = createRepairService({ state, CONFIG, OPENCLAW_PATH, OPENCLAW_CONFIG_PATH, OPENCLAW_LOG_DIR, GATEWAY_PORT, log, checkGatewayHealth, checkOpenClawStatus, sendTelegramNotification });

// --- Main Loop ---
async function healthCheckLoop() {
    /* istanbul ignore next */
    if (!state.isRunning) return;

    try {
        // Grace period: skip health checks right after a restart
        const timeSinceRestart = Date.now() - state.lastRestartTime;
        /* istanbul ignore next */
        if (state.lastRestartTime > 0 && timeSinceRestart < CONFIG.restartGracePeriodMs) {
            const remaining = Math.ceil((CONFIG.restartGracePeriodMs - timeSinceRestart) / 1000);
            log('info', `🛡️ 重啟保護期中，跳過健康檢查 (${remaining}s 後恢復)`);
            if (state.isRunning) {
                state.timer = setTimeout(healthCheckLoop, CONFIG.checkIntervalMs);
            }
            return;
        }

        // Phase 1: Checks
        const health = await checkGatewayHealth();
        const ocStatus = await checkOpenClawStatus();

        if (health.healthy && ocStatus.healthy) {
            if (state.currentStatus !== 'healthy') {
                log('info', `✅ Gateway 恢復健康`, { previousStatus: state.currentStatus });
            }
            state.currentStatus = 'healthy';
            state.consecutiveFailures = 0;
            state.lastHealthy = Date.now();
        } else if (ocStatus.error === 'config_invalid' || (!health.healthy && !ocStatus.healthy)) {
            state.consecutiveFailures++;
            /* istanbul ignore next */
            const reason = ocStatus.error === 'config_invalid' ? ocStatus.detail : (health.detail || health.reason || 'unknown');

            log('warn', `🔴 Gateway 異常 (連續 ${state.consecutiveFailures} 次) - ${reason}`, { reason, health, ocStatus });

            if (state.consecutiveFailures >= 3 || ocStatus.error === 'config_invalid') {
                state.currentStatus = 'down';

                const timeSinceRepair = Date.now() - state.lastRepairTime;
                /* istanbul ignore next */
                if (timeSinceRepair < CONFIG.repairCooldownMs && state.repairAttempts > 0) {
                    log('info', `⏳ 修復冷卻中 (${Math.ceil((CONFIG.repairCooldownMs - timeSinceRepair) / 1000)}s)`);
                } else if (state.repairAttempts < CONFIG.maxRepairAttempts) {
                    await attemptRepair(reason);
                } else {
                    if (state.currentStatus !== 'escalated') {
                        state.currentStatus = 'escalated';
                    }
                }
            }
        } else /* istanbul ignore next */ if (!health.healthy && ocStatus.healthy) {
            /* istanbul ignore next */
            if (state.currentStatus === 'down' || state.currentStatus === 'escalated') {
                state.currentStatus = 'degraded';
                log('warn', `⚠️ Gateway 部分異常: HTTP 失敗但 openclaw status OK`, { health, ocStatus });
            } else {
                state.currentStatus = 'healthy';
                state.consecutiveFailures = 0;
                state.lastHealthy = Date.now();
            }
        }
    } catch (e) { /* istanbul ignore next */
        log('err', `健康檢查發生未預期錯誤`, { error: e.message });
    }

    // Schedule next check
    /* istanbul ignore next */
    if (state.isRunning) {
        /* istanbul ignore next */
        const interval = state.currentStatus === 'repairing' ? CONFIG.repairWaitMs : CONFIG.checkIntervalMs;
        state.timer = setTimeout(healthCheckLoop, interval);
    }
}

// --- Public API ---
function start() {
    if (state.isRunning) return;
    state.isRunning = true;
    state.currentStatus = 'unknown';
    log('info', '🐕 Gateway Watchdog 啟動', {
        checkInterval: `${CONFIG.checkIntervalMs / 1000}s`,
        maxRepairAttempts: CONFIG.maxRepairAttempts,
        gatewayPort: GATEWAY_PORT,
    });

    // First check after 10 seconds (let server finish startup)
    state.timer = setTimeout(healthCheckLoop, 10_000);
}

function stop() {
    state.isRunning = false;
    if (state.timer) {
        clearTimeout(state.timer);
        state.timer = null;
    }
    log('info', '🐕 Gateway Watchdog 已停止');
}

function getStatus() {
    return {
        isRunning: state.isRunning,
        currentStatus: state.currentStatus,
        repairAttempts: state.repairAttempts,
        maxRepairAttempts: CONFIG.maxRepairAttempts,
        consecutiveFailures: state.consecutiveFailures,
        /* istanbul ignore next */
        lastHealthy: state.lastHealthy ? fmtTime(new Date(state.lastHealthy)) : null,
        lastRepairTime: state.lastRepairTime ? fmtTime(new Date(state.lastRepairTime)) : null,
        totalRepairs: state.totalRepairs,
        totalAlerts: state.totalAlerts,
        events: state.events.slice(-20),
        repairHistory: state.repairHistory.slice(-5),
    };
}

// Manual trigger for testing
async function triggerRepair() {
    log('info', '🔧 手動觸發修復');
    state.repairAttempts = 0;
    state.consecutiveFailures = 2;
    return attemptRepair('手動觸發');
}

module.exports = {
    start,
    stop,
    getStatus,
    triggerRepair,
    CONFIG,
};
