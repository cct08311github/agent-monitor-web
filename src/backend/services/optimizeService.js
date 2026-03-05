// src/backend/services/optimizeService.js
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

const PROJECT_PATH = path.join(os.homedir(), '.openclaw', 'shared', 'projects', 'agent-monitor-web');
const PLANS_DIR = path.join(PROJECT_PATH, 'docs', 'plans');
const OPENCLAW_PATH = path.join(os.homedir(), '.openclaw', 'bin', 'openclaw');
const OPENCLAW_ENV_PATH = path.join(os.homedir(), '.openclaw', '.env');

function getGeminiApiKey() {
    if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
    try {
        const raw = fs.readFileSync(OPENCLAW_ENV_PATH, 'utf8');
        const match = raw.match(/^GEMINI_API_KEY=(.+)$/m);
        return match ? match[1].trim() : null;
    } catch (_) {
        return null;
    }
}

const { execFile } = require('child_process');

const tsdbService = require('./tsdbService');
const alertEngine = require('./alertEngine');
const openclawService = require('./openclawService');

async function collectData() {
    const [costHistory, agents, alerts] = await Promise.all([
        Promise.resolve(tsdbService.getCostHistory ? tsdbService.getCostHistory(60) : []).catch(() => []),
        openclawService.getOpenClawData('openclaw agents list').catch(() => []),
        Promise.resolve().then(() => alertEngine.getRecent(50)).catch(() => []),
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

const SYSTEM_OPUS_CODE_REVIEW = `你是資深後端工程師，負責 agent-monitor-web 的 Code Review 與 QA。
專案路徑：${PROJECT_PATH}

審查以下實際源碼，輸出結構化報告。每個問題格式：

### [類別] 檔案名稱：簡述
- **優先級**：P0/P1/P2
- **問題**：...
- **建議**：...

類別：BUG / SECURITY / ERROR_HANDLING / PERFORMANCE / TEST_COVERAGE

重點審查：
1. 潛在 bugs 與邊界條件
2. 安全漏洞（注入、越權、資料洩漏）
3. 錯誤處理不足
4. 效能瓶頸
5. 缺少測試的高風險邏輯

只列出真實問題，不要無意義的建議。`;

const TARGET_FILES = [
    'src/backend/routes/api.js',
    'src/backend/middlewares/auth.js',
    'src/backend/services/alertEngine.js',
    'src/backend/services/openclawService.js',
    'src/backend/services/tsdbService.js',
    'src/backend/services/optimizeService.js',
    'src/backend/controllers/optimizeController.js',
    'src/backend/controllers/legacyDashboardController.js',
];

function readSourceFiles() {
    const MAX_CHARS = 3000;
    return TARGET_FILES.map(rel => {
        try {
            const content = fs.readFileSync(path.join(PROJECT_PATH, rel), 'utf8');
            const truncated = content.length > MAX_CHARS
                ? content.slice(0, MAX_CHARS) + '\n... (truncated)'
                : content;
            return `### ${rel}\n\`\`\`js\n${truncated}\n\`\`\``;
        } catch (_) {
            return `### ${rel}\n(無法讀取)`;
        }
    }).join('\n\n');
}

const SYSTEM_SONNET_INTEGRATE = `你是 agent-monitor-web 的技術負責人。
專案路徑：${PROJECT_PATH}

將以下資料整合成最終報告（兩大章節）：

## 第一章：優化建議
整合優化草案與 Opus 草案審查意見：
- 採納 Opus 的合理修改，標註「[Opus 修訂]」
- 每項附：問題、建議、Opus補充、優先級（P0/P1/P2）
- 結尾附「實施順序建議」

## 第二章：Code Review & QA
整理 Opus code review 結果：
- 依優先級排序（P0→P1→P2）
- 標明每項對應檔案與修改建議
- 結尾附「必修清單（P0 項目）」

輸出：完整 markdown，可直接存為實施計畫。`;

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
const GEMINI_MODEL = 'gemini-3.1-pro-preview';

async function callGemini(apiKey, system, userContent, maxTokens = 4096) {
    const resp = await fetch(GEMINI_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: GEMINI_MODEL,
            max_tokens: maxTokens,
            messages: [
                { role: 'system', content: system },
                { role: 'user', content: userContent },
            ],
        }),
    });
    if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        throw new Error(`Gemini API error ${resp.status}: ${errText}`);
    }
    const json = await resp.json();
    return json.choices[0].message.content;
}

async function runPipeline(data, onProgress) {
    const apiKey = getGeminiApiKey();
    if (!apiKey) {
        throw new Error('GEMINI_API_KEY 未設定');
    }

    const dataStr = JSON.stringify({
        costHistory: data.costHistory,
        agents: data.agents,
        alerts: data.alerts,
    }, null, 2);

    const existingList = (data.existingPlans || []).join('\n');

    // Step 2: 起草
    onProgress(2, 'Gemini 起草中...');
    const draft = await callGemini(
        apiKey,
        SYSTEM_SONNET_DRAFT.replace('{DATE}', TODAY()).replace('{EXISTING_PLANS}', existingList),
        `運行數據：\n${dataStr}`
    );

    // Step 3: 審查草案（失敗時降級）
    onProgress(3, 'Gemini 審查草案中...');
    let review = null;
    let opusFailed = false;
    try {
        review = await callGemini(apiKey, SYSTEM_OPUS_REVIEW, `優化草案：\n${draft}`);
    } catch (e) {
        opusFailed = true;
        review = `（草案審查失敗：${e.message}）`;
    }

    // Step 4: Code Review（失敗時降級）
    onProgress(4, 'Gemini Code Review 中...');
    let codeReview = null;
    let codeReviewFailed = false;
    try {
        const sourceCode = readSourceFiles();
        codeReview = await callGemini(apiKey, SYSTEM_OPUS_CODE_REVIEW, `源碼：\n${sourceCode}`);
    } catch (e) {
        codeReviewFailed = true;
        codeReview = `（Code Review 失敗：${e.message}）`;
    }

    // Step 5: 整合
    onProgress(5, 'Gemini 整合中...');
    let integrateSystem = SYSTEM_SONNET_INTEGRATE;
    if (opusFailed) integrateSystem += '\n\n注意：草案審查未完成，請標註「[未經審查]」。';
    if (codeReviewFailed) integrateSystem += '\n\n注意：Code Review 未完成，請標註「[Code Review 缺失]」。';
    const report = await callGemini(
        apiKey,
        integrateSystem,
        `草案：\n${draft}\n\n草案審查：\n${review}\n\nCode Review：\n${codeReview}`,
        8000
    );

    return { draft, review, codeReview, report, opusFailed: opusFailed || codeReviewFailed };
}

function execFileAsync(bin, args, opts) {
    return new Promise((resolve, reject) => {
        execFile(bin, args, opts, (err, stdout, stderr) => {
            if (err) reject(err); else resolve({ stdout, stderr });
        });
    });
}

async function saveAndNotify(report, opusFailed, onProgress) {
    // Step 6: 儲存
    onProgress(6, '儲存報告...');
    const date = TODAY();
    const filename = `${date}-auto-optimize.md`;
    const filepath = path.join(PLANS_DIR, filename);

    const header = `# Auto-Optimize Report — ${date}\n` +
        (opusFailed ? '> ⚠️ 本報告未經 Opus 完整審查\n\n' : '') +
        `> 生成時間：${new Date().toISOString()}\n\n`;

    await fs.promises.mkdir(PLANS_DIR, { recursive: true });
    await fs.promises.writeFile(filepath, header + report, 'utf8');

    // Step 7: Telegram 推播
    onProgress(7, 'Telegram 推播...');
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
