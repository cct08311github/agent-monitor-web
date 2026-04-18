// src/backend/controllers/optimizeController.js
'use strict';
const optimizeService = require('../services/optimizeService');

let isRunning = false;
let lastCompletedAt = 0;
const COOLDOWN_MS = 10 * 60 * 1000; // 10 分鐘冷卻

// H3: connection limit to prevent resource exhaustion
const MAX_OPTIMIZE_CLIENTS = 3;
let activeClients = 0;

// _setRunning 供外部（測試）使用，不應清零 lastCompletedAt
function _setRunning(val) {
    isRunning = val;
}

async function run(req, res) {
    const now = Date.now();

    if (isRunning) {
        return res.status(409).json({ success: false, error: '優化正在進行中，請稍後再試' });
    }

    // H3: reject if too many clients already connected
    if (activeClients >= MAX_OPTIMIZE_CLIENTS) {
        return res.status(503).json({ success: false, error: '連線數已達上限，請關閉其他分頁後重試' });
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
    activeClients++;

    // H2: safety timeout — auto-reset isRunning if pipeline hangs beyond 15 minutes
    const safetyTimeout = setTimeout(() => {
        if (isRunning) {
            isRunning = false;
            const logger = require('../utils/logger');
            logger.error('optimize_safety_timeout', { requestId: req.requestId, msg: 'Pipeline exceeded 15-minute safety limit, auto-reset isRunning' });
        }
    }, 15 * 60 * 1000);

    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
    });

    let clientGone = false;
    req.on('close', () => {
        clientGone = true;
        // H3: decrement counter on client disconnect
        activeClients = Math.max(0, activeClients - 1);
    });

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
        // H1: log error server-side only, never expose e.message to client
        const logger = require('../utils/logger');
        logger.error('optimize_pipeline_error', { requestId: req.requestId, err: e.message, stack: e.stack });
        if (!clientGone) res.write(`event: error\ndata: ${JSON.stringify({ msg: '優化執行失敗，請稍後再試' })}\n\n`);
    } finally {
        clearTimeout(safetyTimeout);
        isRunning = false;
        // H3: only decrement if client is still connected (disconnect handler already decremented)
        if (!clientGone) activeClients = Math.max(0, activeClients - 1);
        lastCompletedAt = Date.now(); // 只在此處設定，供 cooldown 判斷
        res.end();
    }
}

function _resetCooldown() { lastCompletedAt = 0; }

module.exports = { run, _setRunning, _resetCooldown };
