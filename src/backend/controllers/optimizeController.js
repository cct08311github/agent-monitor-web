// src/backend/controllers/optimizeController.js
'use strict';
const optimizeService = require('../services/optimizeService');

let isRunning = false;
let lastCompletedAt = 0;
const COOLDOWN_MS = 10 * 60 * 1000; // 10 分鐘冷卻，防止 EventSource 重連觸發重複執行

function _setRunning(val) { isRunning = val; if (!val) lastCompletedAt = 0; }

async function run(req, res) {
    const now = Date.now();

    if (isRunning) {
        return res.status(409).json({ success: false, error: '優化正在進行中，請稍後再試' });
    }

    // 冷卻中：EventSource 重連時直接回 204，阻止其繼續重連
    if (now - lastCompletedAt < COOLDOWN_MS) {
        return res.status(204).end();
    }

    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
    });

    // 客戶端斷線時不再繼續執行（防止殭屍 pipeline）
    let clientGone = false;
    req.on('close', () => { clientGone = true; });

    function sendProgress(step, msg) {
        if (!clientGone) res.write(`event: progress\ndata: ${JSON.stringify({ step, msg })}\n\n`);
    }

    isRunning = true;
    try {
        sendProgress(1, '收集數據中...');
        const data = await optimizeService.collectData();

        const { report, opusFailed } = await optimizeService.runPipeline(data, sendProgress);

        const { filename } = await optimizeService.saveAndNotify(report, opusFailed, sendProgress);

        const summary = report.split('\n').filter(l => l.startsWith('##')).slice(0, 3).join(' | ');
        if (!clientGone) res.write(`event: done\ndata: ${JSON.stringify({ filename, summary, opusFailed })}\n\n`);
    } catch (e) {
        if (!clientGone) res.write(`event: error\ndata: ${JSON.stringify({ msg: e.message })}\n\n`);
    } finally {
        isRunning = false;
        lastCompletedAt = Date.now();
        res.end();
    }
}

module.exports = { run, _setRunning };
