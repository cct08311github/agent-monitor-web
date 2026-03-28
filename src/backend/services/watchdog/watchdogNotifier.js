'use strict';

const util = require('util');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const { fmtTime } = require('./watchdogEventLogger');

const execFilePromise = util.promisify(execFile);

function createNotifier({ state, CONFIG, OPENCLAW_PATH, GATEWAY_PORT, optimizeConfig, log }) {
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

    return { sendTelegramNotification };
}

module.exports = { createNotifier };
