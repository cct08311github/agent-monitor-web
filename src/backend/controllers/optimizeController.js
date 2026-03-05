// src/backend/controllers/optimizeController.js
'use strict';
const optimizeService = require('../services/optimizeService');

let isRunning = false;

function _setRunning(val) { isRunning = val; }

async function run(req, res) {
    if (isRunning) {
        return res.status(409).json({ success: false, error: '優化正在進行中，請稍後再試' });
    }

    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
    });

    function sendProgress(step, msg) {
        res.write(`event: progress\ndata: ${JSON.stringify({ step, msg })}\n\n`);
    }

    isRunning = true;
    try {
        sendProgress(1, '收集數據中...');
        const data = await optimizeService.collectData();

        const { report, opusFailed } = await optimizeService.runPipeline(data, sendProgress);

        const { filename } = await optimizeService.saveAndNotify(report, opusFailed, sendProgress);

        const summary = report.split('\n').filter(l => l.startsWith('##')).slice(0, 3).join(' | ');
        res.write(`event: done\ndata: ${JSON.stringify({ filename, summary, opusFailed })}\n\n`);
    } catch (e) {
        res.write(`event: error\ndata: ${JSON.stringify({ msg: e.message })}\n\n`);
    } finally {
        isRunning = false;
        res.end();
    }
}

module.exports = { run, _setRunning };
