// src/backend/controllers/optimizeController.js
'use strict';
const optimizeService = require('../services/optimizeService');

let isRunning = false;
let lastCompletedAt = 0;
const COOLDOWN_MS = 10 * 60 * 1000; // 10 分鐘冷卻

// _setRunning 供外部（測試）使用，不應清零 lastCompletedAt
function _setRunning(val) {
    isRunning = val;
}

async function run(req, res) {
    const now = Date.now();

    if (isRunning) {
        return res.status(409).json({ success: false, error: '優化正在進行中，請稍後再試' });
    }

    // 冷卻期間：必須用 SSE 格式回應，讓前端透過 cooldown 事件主動 es.close()
    // 不可用 204 — EventSource 會把非 text/event-stream 視為失敗並自動重連
    if (now - lastCompletedAt < COOLDOWN_MS) {
        const remaining = Math.ceil((COOLDOWN_MS - (now - lastCompletedAt)) / 1000 / 60);
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
        });
        res.write(`event: cooldown\ndata: ${JSON.stringify({ remaining })}\n\n`);
        res.end();
        return;
    }

    isRunning = true;

    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
    });

    let clientGone = false;
    req.on('close', () => { clientGone = true; });

    function sendProgress(step, msg) {
        if (!clientGone) res.write(`event: progress\ndata: ${JSON.stringify({ step, msg })}\n\n`);
    }
    try {
        sendProgress(1, '收集數據中...');
        const data = await optimizeService.collectData();

        // 斷線後不繼續執行（避免無人接收的 pipeline 仍送出 Telegram）
        if (clientGone) return;

        const { report, opusFailed } = await optimizeService.runPipeline(data, sendProgress);

        if (clientGone) return;

        const { filename } = await optimizeService.saveAndNotify(report, opusFailed, sendProgress);

        const summary = report.split('\n').filter(l => l.startsWith('##')).slice(0, 3).join(' | ');
        if (!clientGone) res.write(`event: done\ndata: ${JSON.stringify({ filename, summary, opusFailed })}\n\n`);
    } catch (e) {
        if (!clientGone) res.write(`event: error\ndata: ${JSON.stringify({ msg: e.message })}\n\n`);
    } finally {
        isRunning = false;
        lastCompletedAt = Date.now(); // 只在此處設定，供 cooldown 判斷
        res.end();
    }
}

function _resetCooldown() { lastCompletedAt = 0; }

module.exports = { run, _setRunning, _resetCooldown };
