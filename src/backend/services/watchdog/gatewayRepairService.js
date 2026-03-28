'use strict';

const util = require('util');
const { execFile, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { fmtTime } = require('./watchdogEventLogger');

const execFilePromise = util.promisify(execFile);
const execPromise = util.promisify(exec);

function createRepairService({ state, CONFIG, OPENCLAW_PATH, OPENCLAW_CONFIG_PATH, OPENCLAW_LOG_DIR, GATEWAY_PORT, log, checkGatewayHealth, checkOpenClawStatus, sendTelegramNotification }) {

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
            // Step 2: Construct the prompt for Gemini CLI
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
                const { stdout, stderr } = await execFilePromise(geminiPath, [
                    '-p', fixPrompt,
                    '-y',
                ], { timeout: CONFIG.geminiTimeoutMs });

                geminiOutput = (stdout || stderr || '').toString().trim();
                repairRecord.sreResponse = geminiOutput.slice(0, 2000);
                repairRecord.steps.push({ action: 'gemini_response', output: geminiOutput.slice(0, 500) });
                log('info', `[修復 ${attempt}] Gemini 回覆: ${geminiOutput.slice(-300)}`);

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

        // Step 4: Restart gateway after config changes
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

    return { attemptRepair, collectDiagnostics, findGeminiCli };
}

module.exports = { createRepairService };
