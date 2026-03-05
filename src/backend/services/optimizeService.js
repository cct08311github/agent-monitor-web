// src/backend/services/optimizeService.js
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

const PROJECT_PATH = path.join(os.homedir(), '.openclaw', 'shared', 'projects', 'agent-monitor-web');
const PLANS_DIR = path.join(PROJECT_PATH, 'docs', 'plans');
const OPENCLAW_PATH = path.join(os.homedir(), '.openclaw', 'bin', 'openclaw');

const { execFile } = require('child_process');

const tsdbService = require('./tsdbService');
const alertEngine = require('./alertEngine');
const openclawService = require('./openclawService');

async function collectData() {
    const [costHistory, agents, alerts] = await Promise.all([
        Promise.resolve(tsdbService.getCostHistory ? tsdbService.getCostHistory(60) : []).catch(() => []),
        openclawService.listAgents().catch(() => []),
        Promise.resolve(alertEngine.getRecent(50)),
    ]);

    let existingPlans = [];
    try {
        existingPlans = fs.readdirSync(PLANS_DIR)
            .filter(f => f.endsWith('.md'))
            .sort()
            .reverse()
            .slice(0, 20);
    } catch (_) {}

    return { costHistory, agents, alerts, existingPlans };
}

const TODAY = () => new Date().toISOString().slice(0, 10);

const SYSTEM_SONNET_DRAFT = `你是 agent-monitor-web 的系統分析師。
專案路徑：${PROJECT_PATH}
今日日期：{DATE}

根據以下運行數據，識別 3-5 個最值得優化的項目，每項包含：
- 問題描述（基於數據事實）
- 建議改善方向
- 預估影響（高/中/低）

不要提出已在以下已完成方案中出現的項目：{EXISTING_PLANS}
輸出格式：markdown，以 ## 分節。`;

const SYSTEM_OPUS_REVIEW = `你是獨立技術顧問，負責審查 agent-monitor-web 的優化草案。
專案路徑：${PROJECT_PATH}

對草案中每個優化項目，指出：
1. 邏輯不足或假設錯誤之處
2. 遺漏的風險或副作用
3. 具體改善建議

保持批判立場，不要為草案辯護。每項以 ### 分節。`;

const SYSTEM_SONNET_INTEGRATE = `你是 agent-monitor-web 的技術負責人。
專案路徑：${PROJECT_PATH}

將下列草案與 Opus 審查意見整合成最終優化方案：
- 採納 Opus 的合理修改
- 標註「[Opus 修訂]」的段落
- 每項優化附上：問題、建議、Opus補充、優先級（P0/P1/P2）
- 結尾附「實施順序建議」

輸出：完整 markdown，可直接存為實施計畫。`;

async function runPipeline(data, onProgress) {
    if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error('ANTHROPIC_API_KEY 未設定');
    }

    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const dataStr = JSON.stringify({
        costHistory: data.costHistory,
        agents: data.agents,
        alerts: data.alerts,
    }, null, 2);

    const existingList = (data.existingPlans || []).join('\n');

    // Step 2: Sonnet 起草
    onProgress(2, 'Sonnet 起草中...');
    const draftResp = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: SYSTEM_SONNET_DRAFT
            .replace('{DATE}', TODAY())
            .replace('{EXISTING_PLANS}', existingList),
        messages: [{ role: 'user', content: `運行數據：\n${dataStr}` }],
    });
    const draft = draftResp.content[0].text;

    // Step 3: Opus 審查（失敗時降級）
    onProgress(3, 'Opus 審查中...');
    let review = null;
    let opusFailed = false;
    try {
        const reviewResp = await client.messages.create({
            model: 'claude-opus-4-6',
            max_tokens: 4096,
            system: SYSTEM_OPUS_REVIEW,
            messages: [{ role: 'user', content: `優化草案：\n${draft}` }],
        });
        review = reviewResp.content[0].text;
    } catch (e) {
        opusFailed = true;
        review = `（Opus 審查失敗：${e.message}，以下為降級報告）`;
    }

    // Step 4: Sonnet 整合
    onProgress(4, 'Sonnet 整合中...');
    const integrateSystem = SYSTEM_SONNET_INTEGRATE +
        (opusFailed ? '\n\n注意：本報告未經 Opus 完整審查，請標註「[未經 Opus 審查]」。' : '');
    const integrateResp = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 6000,
        system: integrateSystem,
        messages: [{ role: 'user', content: `草案：\n${draft}\n\nOpus審查：\n${review}` }],
    });
    const report = integrateResp.content[0].text;

    return { draft, review, report, opusFailed };
}

function execFileAsync(bin, args, opts) {
    return new Promise((resolve, reject) => {
        execFile(bin, args, opts, (err, stdout, stderr) => {
            if (err) reject(err); else resolve({ stdout, stderr });
        });
    });
}

async function saveAndNotify(report, opusFailed, onProgress) {
    // Step 5: 儲存
    onProgress(5, '儲存報告...');
    const date = TODAY();
    const filename = `${date}-auto-optimize.md`;
    const filepath = path.join(PLANS_DIR, filename);

    const header = `# Auto-Optimize Report — ${date}\n` +
        (opusFailed ? '> ⚠️ 本報告未經 Opus 完整審查\n\n' : '') +
        `> 生成時間：${new Date().toISOString()}\n\n`;

    fs.writeFileSync(filepath, header + report, 'utf8');

    // Step 6: Telegram 推播
    onProgress(6, 'Telegram 推播...');
    const summary = report.split('\n').filter(l => l.startsWith('##')).slice(0, 3).join(' | ');
    const message = `🤖 自主優化報告已生成 (${date})\n${summary}\n📄 ${filename}`;

    try {
        await execFileAsync(OPENCLAW_PATH, [
            'message', 'send', '--channel', 'telegram',
            '--target', '-1003873859338', '--message', message
        ], { timeout: 30_000 });
    } catch (_) {
        // Telegram 失敗不中斷流程
    }

    return { filename, filepath };
}

module.exports = { collectData, runPipeline, saveAndNotify, PROJECT_PATH, OPENCLAW_PATH };
