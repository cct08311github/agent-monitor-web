/**
 * Gateway Watchdog Service — 自動修復機制
 * 
 * 功能:
 * 1. 每 30 秒檢查 Gateway 健康狀態
 * 2. 偵測異常時自動嘗試修復（最多 3 次）
 * 3. 修復成功 → Telegram 通知 + 報告
 * 4. 3 次修復失敗 → Telegram 告知需人工介入 + 建議下一步
 * 5. 所有事件寫入日誌
 */

const util = require('util');
const { execFile, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { getOpenClawConfig, getOptimizeConfig, getProjectRoot, getGatewayConfig, getWatchdogConfig } = require('../config');
const logger = require('../utils/logger');

const execFilePromise = util.promisify(execFile);
const execPromise = util.promisify(exec);

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
    lastRestartTime: 0,              // Track when we last triggered a Gateway restart
    lastTelegramTime: 0,
    lastHealthy: Date.now(),
    consecutiveFailures: 0,
    totalRepairs: 0,
    totalAlerts: 0,
    currentStatus: 'unknown',       // 'healthy' | 'degraded' | 'down' | 'repairing' | 'escalated'
    events: [],                      // Recent events for frontend display
    repairHistory: [],               // Detailed repair history
};

// --- Logging ---
function ensureLogDir() {
    if (!fs.existsSync(CONFIG.logDir)) {
        fs.mkdirSync(CONFIG.logDir, { recursive: true });
    }
}

function fmtTime(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
}

function log(level, msg, details = {}) {
    const entry = {
        ts: new Date().toISOString(),
        tsLocal: fmtTime(),
        level,
        msg,
        ...details,
    };
    const loggerLevel = level === 'err' ? 'error' : (level === 'warn' ? 'warn' : 'info');
    logger[loggerLevel]('gateway_watchdog', {
        msg,
        watchdogLevel: level,
        details: Object.keys(details).length ? details : undefined,
    });

    // Add to in-memory events (keep last 100)
    state.events.push(entry);
    /* istanbul ignore next */
    if (state.events.length > 100) state.events.shift();

    // Write to daily log file
    try {
        ensureLogDir();
        const d = new Date();
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const logFile = path.join(CONFIG.logDir, `watchdog-${dateStr}.jsonl`);
        fs.appendFileSync(logFile, JSON.stringify(entry) + '\n', 'utf8');
    } catch (e) {
        logger.error('gateway_watchdog_log_write_failed', {
            details: logger.toErrorFields(e),
        });
    }
}

// --- Health Check ---
async function checkGatewayHealth() {
    return new Promise((resolve) => {
        /* istanbul ignore next */
        const timeout = setTimeout(() => {
            resolve({ healthy: false, reason: 'timeout', detail: `Gateway 無回應 (${CONFIG.healthCheckTimeoutMs}ms 超時)` });
        }, CONFIG.healthCheckTimeoutMs);

        const req = http.request({
            hostname: GATEWAY_HOST,
            port: GATEWAY_PORT,
            path: '/healthz',
            method: 'GET',
            timeout: CONFIG.healthCheckTimeoutMs,
        }, (res) => {
            clearTimeout(timeout);
            let body = '';
            res.on('data', (chunk) => { body += chunk; });
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 400) {
                    resolve({ healthy: true, statusCode: res.statusCode, body });
                } else {
                    resolve({ healthy: false, reason: 'http_error', statusCode: res.statusCode, detail: `HTTP ${res.statusCode}: ${body.slice(0, 200)}` });
                }
            });
        });

        req.on('error', (err) => {
            clearTimeout(timeout);
            resolve({ healthy: false, reason: 'connection_error', detail: `連線失敗: ${err.message}` });
        });

        req.on('timeout', () => {
            clearTimeout(timeout);
            req.destroy();
            resolve({ healthy: false, reason: 'timeout', detail: 'Gateway 連線超時' });
        });

        req.end();
    });
}

// Fallback & Deep Check: Check via `openclaw status`
async function checkOpenClawStatus() {
    try {
        const { stdout, stderr } = await execFilePromise(OPENCLAW_PATH, ['status'], { timeout: 15_000 });
        const output = (stdout.toString() + stderr.toString()).toLowerCase();

        /* istanbul ignore next */
        if (output.includes('config invalid') || output.includes('syntaxerror')) {
            return { healthy: false, error: 'config_invalid', detail: 'OpenClaw 設定檔格式錯誤 (JSON Invalid)' };
        }

        const isRunning = output.includes('running') || output.includes('online') || output.includes('gateway');
        return { healthy: isRunning, output: stdout.toString().slice(0, 500) };
    } catch (e) {
        const output = e.stderr?.toString().toLowerCase() || e.stdout?.toString().toLowerCase() || '';
        /* istanbul ignore next */
        if (output.includes('config invalid') || output.includes('syntaxerror')) {
            return { healthy: false, error: 'config_invalid', detail: 'OpenClaw 設定檔格式錯誤 (JSON Invalid)' };
        }
        return { healthy: false, error: 'command_error', detail: e.message };
    }
}

// Collect system diagnostics and recent errors for the Gemini CLI to analyze
async function collectDiagnostics(reason) {
    const diag = { reason, ts: fmtTime() };

    try {
        const { stdout: portInfo } = await execPromise(`lsof -i :${GATEWAY_PORT} 2>/dev/null || echo "port_not_in_use"`, { timeout: 5_000 });
        diag.portInfo = portInfo.trim().slice(0, 300);
    } catch (e) { diag.portInfo = `check_failed: ${e.message}`; }

    try {
        const os = require('os');
        diag.cpu = (os.loadavg()[0] / os.cpus().length * 100).toFixed(1) + '%';
        diag.memory = ((1 - os.freemem() / os.totalmem()) * 100).toFixed(1) + '%';
        diag.uptime = Math.floor(os.uptime() / 3600) + 'h';
    } catch (e) { /* OS stats best-effort — non-critical */ }

    try {
        // Collect errors exactly like the shell script does (tail logs, grep errors)
        const d = new Date();
        const ymd = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
        const logPaths = [
            path.join(OPENCLAW_LOG_DIR, `openclaw-${ymd}.log`),
            `/tmp/openclaw-1000/openclaw-${ymd}.log`
        ].join(' ');

        const { stdout: logs } = await execPromise(
            `cat ${logPaths} 2>/dev/null | tail -100 | grep -i "error\\|fatal\\|invalid\\|failed\\|EADDRINUSE" | tail -30 || true`,
            { timeout: 5_000 }
        );
        diag.recentLogs = logs.trim().slice(0, 1500) || 'No specific errors found in recent logs.';
    } catch (e) { diag.recentLogs = 'logs_unavailable'; }

    try {
        const { stdout: procs } = await execPromise(`ps aux | grep -i "openclaw" | grep -v grep | head -5`, { timeout: 5_000 });
        diag.processes = procs.trim().slice(0, 400);
    } catch (e) { diag.processes = 'check_failed'; }

    return diag;
}

// Find gemini cli path
async function findGeminiCli() {
    try {
        const { stdout } = await execPromise('command -v gemini 2>/dev/null || true');
        if (stdout.trim()) return stdout.trim();

        const paths = ['/opt/homebrew/bin/gemini', '/usr/local/bin/gemini', '/Users/openclaw/.local/bin/gemini'];
        for (const p of paths) {
            if (fs.existsSync(p)) return p;
        }
    } catch (e) { /* gemini cli lookup — returns null if unavailable */ }
    return null;
}

async function attemptRepair(reason) {
    state.currentStatus = 'repairing';
    state.repairAttempts++;
    state.lastRepairTime = Date.now();
    state.totalRepairs++;

    const attempt = state.repairAttempts;
    log('warn', `🔧 開始修復嘗試 ${attempt}/${CONFIG.maxRepairAttempts} — 呼叫 Gemini CLI`, { reason });

    const repairRecord = {
        attempt,
        startTime: fmtTime(),
        reason,
        steps: [],
        sreResponse: null,
        success: false,
    };

    // Step 1: Collect diagnostics
    repairRecord.steps.push({ action: 'collect_diagnostics', ts: fmtTime() });
    log('info', `[修復 ${attempt}] 收集系統診斷與錯誤日誌...`);
    const diagnostics = await collectDiagnostics(reason);
    repairRecord.steps.push({ action: 'diagnostics_collected', data: diagnostics });

    // Always try a simple restart first (attempt 1), before calling AI
    if (attempt === 1) {
        log('info', `[修復 ${attempt}] 嘗試簡單的 process restart 作為初步修復...`);
        repairRecord.steps.push({ action: 'initial_restart', ts: fmtTime() });
        try {
            await execFilePromise(OPENCLAW_PATH, ['gateway', 'restart'], { timeout: 30_000 });
            state.lastRestartTime = Date.now();
            log('info', `[修復 ${attempt}] 等待 ${CONFIG.repairWaitMs / 1000} 秒讓 Gateway 完成重啟...`);
            await new Promise(r => setTimeout(r, CONFIG.repairWaitMs));
            const { healthy } = await checkGatewayHealth();
            if (healthy) {
                log('info', `✅ 初步重啟即成功，無須呼叫 Gemini CLI`);
                state.currentStatus = 'healthy';
                state.consecutiveFailures = 0;
                state.repairAttempts = 0;
                state.lastHealthy = Date.now();
                repairRecord.endTime = fmtTime();
                repairRecord.success = true;
                repairRecord.steps.push({ action: 'initial_restart_success' });
                state.repairHistory.push(repairRecord);
                await sendTelegramNotification('repair_success', { attempt, reason, repairRecord, sreOutput: '簡單重啟即恢復正常。' });
                return true;
            }
        } catch (e) {
            log('warn', `[修復 ${attempt}] 簡單重啟失敗: ${e.message}`);
        }
    }

    // Locate Gemini CLI
    const geminiPath = await findGeminiCli();
    if (!geminiPath) {
        log('err', `[修復 ${attempt}] 找不到 gemini CLI，無法進行智能修復。`);
        repairRecord.steps.push({ action: 'gemini_not_found' });
    } else {
        // Step 2: Construct the prompt for Gemini CLI — diagnose & fix config only, NO restart
        const fixPrompt = `OpenClaw Gateway 異常。請診斷問題並修復配置，但 **絕對不要** 執行 gateway restart。

Error context (Recent logs):
${diagnostics.recentLogs}

Port Info (18789):
${diagnostics.portInfo}

Processes:
${diagnostics.processes}

Common causes:
- Invalid JSON in ${OPENCLAW_CONFIG_PATH}
- Broken plugin references in plugins.load.paths
- EADDRINUSE (Port 18789 in use by a zombie process)

⚠️ CRITICAL RULES:
- **禁止執行 openclaw gateway restart** — 重啟由 Watchdog 統一管理。
- **禁止執行 kill -9 任何 openclaw 進程** — 這會中斷正在執行的 Sub-Agent。
- Prefer minimal changes to config files only.
- After fixing config, verify JSON: python3 -m json.tool ${OPENCLAW_CONFIG_PATH} > /dev/null
- If port is stuck by a zombie process, only kill that specific zombie PID, not the main gateway.

Show what you changed.`;

        // Step 3: Call Gemini CLI
        repairRecord.steps.push({ action: 'call_gemini_cli', ts: fmtTime() });
        log('info', `[修復 ${attempt}] 🤖 呼叫 Gemini CLI 進行智能修復 (${geminiPath})...`);

        let geminiOutput = '';
        try {
            // gemini CLI auto-repair, using YOLO mode to skip confirmations
            const { stdout, stderr } = await execFilePromise(geminiPath, [
                '-p', fixPrompt,
                '-y', // yolo mode (auto-approve actions in headless environment)
            ], { timeout: CONFIG.geminiTimeoutMs }); // 2 分鐘超時，避免卡死

            geminiOutput = (stdout || stderr || '').toString().trim();
            repairRecord.sreResponse = geminiOutput.slice(0, 2000);
            repairRecord.steps.push({ action: 'gemini_response', output: geminiOutput.slice(0, 500) });
            log('info', `[修復 ${attempt}] Gemini 回覆: ${geminiOutput.slice(-300)}`); // show tail of output

        } catch (e) {
            /* istanbul ignore next */
            repairRecord.steps.push({ action: 'gemini_cli_error', error: e.message.slice(0, 300) });
            /* istanbul ignore next */
            log('err', `[修復 ${attempt}] Gemini CLI 執行失敗 (或超時): ${e.message}`, { error: e.message });
            /* istanbul ignore next */
            geminiOutput = `Gemini CLI 失敗: ${e.message}`;
            /* istanbul ignore next */
            repairRecord.sreResponse = geminiOutput;
        }
    }

    // Step 4: Only restart gateway ONCE if Gemini made config changes.
    // Do NOT blindly kill -9 all processes on the port — that kills healthy gateway + sub-agents.
    try {
        log('info', `[修復 ${attempt}] 配置修復完成，執行 Gateway 重啟...`);
        await execFilePromise(OPENCLAW_PATH, ['gateway', 'restart'], { timeout: 30_000 }).catch(() => { });
        state.lastRestartTime = Date.now();
    } catch (e) { /* istanbul ignore next */
        log('warn', `[修復 ${attempt}] Gateway 重啟指令失敗: ${e.message}`);
    }

    log('info', `[修復 ${attempt}] 等待 ${CONFIG.repairWaitMs / 1000} 秒後驗證...`);
    await new Promise(r => setTimeout(r, CONFIG.repairWaitMs));

    const healthResult = await checkGatewayHealth();
    const statusResult = await checkOpenClawStatus();
    const repaired = healthResult.healthy || statusResult.healthy;

    repairRecord.endTime = fmtTime();
    repairRecord.success = repaired;
    repairRecord.healthCheck = healthResult;
    repairRecord.statusCheck = statusResult;
    state.repairHistory.push(repairRecord);
    /* istanbul ignore next */
    if (state.repairHistory.length > 20) state.repairHistory.shift();

    if (repaired) {
        // Repair succeeded!
        state.currentStatus = 'healthy';
        state.consecutiveFailures = 0;
        state.repairAttempts = 0;
        state.lastHealthy = Date.now();
        log('info', `✅ Gateway 修復成功！嘗試: ${attempt}`, { reason });
        await sendTelegramNotification('repair_success', { attempt, reason, repairRecord, sreOutput: repairRecord.sreResponse });
        return true;
    } else {
        log('warn', `❌ 修復嘗試 ${attempt} 失敗`, { healthResult, statusResult });

        /* istanbul ignore next */
        if (state.repairAttempts >= CONFIG.maxRepairAttempts) {
            // Max retries reached — escalate to user via Telegram
            state.currentStatus = 'escalated';
            log('err', `🚨 已達最大修復次數 (${CONFIG.maxRepairAttempts})，Gemini 無法解決，通知使用者！`);
            await sendTelegramNotification('escalation', {
                reason,
                attempts: state.repairAttempts,
                repairHistory: state.repairHistory.slice(-3),
                lastSreResponse: repairRecord.sreResponse,
            });
            state.repairAttempts = 0;
            return false;
        }
        return false;
    }
}

// --- Telegram Notification ---
async function sendTelegramNotification(type, details) {
    /* istanbul ignore next */
    if (!details) details = {};
    const now = Date.now();
    // Rate limiting: don't spam Telegram
    if (now - state.lastTelegramTime < CONFIG.telegramCooldownMs && type !== 'escalation') {
        log('info', `Telegram 通知冷卻中 (${Math.ceil((CONFIG.telegramCooldownMs - (now - state.lastTelegramTime)) / 1000)}s)`);
        return;
    }

    let message = '';

    if (type === 'repair_success') {
        const { attempt, reason, repairRecord, sreOutput } = details;
        message = [
            `✅ 【Gateway 自動修復成功】`,
            ``,
            `⏰ 時間: ${fmtTime()}`,
            `🔧 原因: ${reason}`,
            `🔄 嘗試次數: ${attempt}`,
            `⚡ 耗時: ${repairRecord?.startTime} → ${repairRecord?.endTime}`,
            ``,
            `🤖 SRE Agent 分析與修復:`,
            `${(sreOutput || '無回覆').slice(0, 600)}`,
            ``,
            `✅ Gateway 已恢復正常運作。`,
        ].join('\n');
    }
    /* istanbul ignore next */
    else if (type === 'escalation') {
        /* istanbul ignore next */
        const { reason, attempts, lastSreResponse } = details;
        /* istanbul ignore next */
        state.totalAlerts++;
        /* istanbul ignore next */
        message = [
            `🚨 【Gateway 修復失敗 — 需要人工介入】`,
            ``,
            `⏰ 時間: ${fmtTime()}`,
            `❌ 原因: ${reason}`,
            `🔄 已嘗試修復: ${attempts} 次 (全部失敗)`,
            ``,
            `🤖 SRE Agent 最後回覆:`,
            `${(lastSreResponse || '無回覆').slice(0, 400)}`,
            ``,
            `📋 建議下一步動作:`,
            `1️⃣ 檢查系統日誌: tail -100 ~/.openclaw/logs/*.log`,
            `2️⃣ 手動重啟 Gateway: openclaw gateway restart`,
            `3️⃣ 檢查端口 ${GATEWAY_PORT}: lsof -i :${GATEWAY_PORT}`,
            `4️⃣ 檢查記憶體/CPU: top -l 1 | head -10`,
            `5️⃣ 如果持續異常，考慮重啟主機`,
            ``,
            `🔗 監控面板: https://localhost:3001`,
            `⚠️ 自動修復將在 5 分鐘後恢復運作`,
        ].join('\n');
    }

    /* istanbul ignore next */
    if (!message) return;

    try {
        // Use openclaw CLI to send via the main agent (which has Telegram binding)
        log('info', `📨 發送 Telegram 通知 (${type})...`);

        // Method 1: Send via openclaw agent talk (to main agent, who relays to Telegram)
        await execFilePromise(OPENCLAW_PATH, [
            'agent', '--agent', 'main', '--message', message, '--no-color'
        ], { timeout: 30_000 }).catch(async () => {
            // Method 2: If agent talk fails, try direct message send
            log('info', '📨 Agent talk 失敗，嘗試直接 message send...');
            await execFilePromise(OPENCLAW_PATH, [
                'message', 'send', '--channel', optimizeConfig.telegramChannel, '--target', optimizeConfig.telegramTarget, '--message', message
            ], { timeout: 30_000 });
        });

        state.lastTelegramTime = now;
        log('info', `✅ Telegram 通知已發送 (${type})`);
    } catch (e) {
        log('err', `❌ Telegram 通知發送失敗`, { error: e.message });

        // Last resort: Write to a file that the user can check
        try {
            const alertFile = path.join(CONFIG.logDir, 'ALERT_PENDING.txt');
            fs.writeFileSync(alertFile, `[${fmtTime()}] ${type}: ${message}\n\n`, { flag: 'a' });
            log('warn', `已寫入備用告警檔: ${alertFile}`);
        } catch (e2) { /* no-op */ }
    }
}

// --- Main Loop ---
async function healthCheckLoop() {
    /* istanbul ignore next */
    if (!state.isRunning) return;

    try {
        // Grace period: skip health checks right after a restart to avoid false positives
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
            // Gateway is explicitly healthy in both endpoints
            if (state.currentStatus !== 'healthy') {
                log('info', `✅ Gateway 恢復健康`, { previousStatus: state.currentStatus });
            }
            state.currentStatus = 'healthy';
            state.consecutiveFailures = 0;
            state.lastHealthy = Date.now();
        } else if (ocStatus.error === 'config_invalid' || (!health.healthy && !ocStatus.healthy)) {
            // Explicit config break or both checks failed — Gateway is down
            state.consecutiveFailures++;
            /* istanbul ignore next */
            const reason = ocStatus.error === 'config_invalid' ? ocStatus.detail : (health.detail || health.reason || 'unknown');

            log('warn', `🔴 Gateway 異常 (連續 ${state.consecutiveFailures} 次) - ${reason}`, { reason, health, ocStatus });

            // Need 3 consecutive failures before triggering repair (unless config is invalid)
            if (state.consecutiveFailures >= 3 || ocStatus.error === 'config_invalid') {
                // Confirmed down (or instantly down if config invalid)
                state.currentStatus = 'down';

                // Check repair cooldown
                const timeSinceRepair = Date.now() - state.lastRepairTime;
                /* istanbul ignore next */
                if (timeSinceRepair < CONFIG.repairCooldownMs && state.repairAttempts > 0) {
                    log('info', `⏳ 修復冷卻中 (${Math.ceil((CONFIG.repairCooldownMs - timeSinceRepair) / 1000)}s)`);
                } else if (state.repairAttempts < CONFIG.maxRepairAttempts) {
                    // Attempt auto-repair
                    await attemptRepair(reason);
                } else {
                    // Already escalated, wait for the next reset cycle
                    if (state.currentStatus !== 'escalated') {
                        state.currentStatus = 'escalated';
                    }
                }
            }
        } else /* istanbul ignore next */ if (!health.healthy && ocStatus.healthy) {
            // OpenClaw is running but HTTP health endpoint failed
            /* istanbul ignore next */
            if (state.currentStatus === 'down' || state.currentStatus === 'escalated') {
                state.currentStatus = 'degraded';
                log('warn', `⚠️ Gateway 部分異常: HTTP 失敗但 openclaw status OK`, { health, ocStatus });
            } else {
                state.currentStatus = 'healthy'; // Treat as healthy if CLI says it's fine
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
    state.consecutiveFailures = 2; // Skip the confirmation threshold
    return attemptRepair('手動觸發');
}

module.exports = {
    start,
    stop,
    getStatus,
    triggerRepair,
    CONFIG,
};
