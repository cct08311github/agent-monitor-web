# Auto-Optimize Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在 agent-monitor-web 新增自主優化功能：UI 按鈕觸發 → 後端收集數據 → Sonnet 起草 → Opus 審查 → Sonnet 整合 → 儲存報告 + Telegram 推播。

**Architecture:** 後端 SSE pipeline：`GET /api/optimize/run` 串流進度給 UI，`optimizeService.js` 依序呼叫 Anthropic SDK 三次（Sonnet→Opus→Sonnet），報告存至 `docs/plans/`，透過 openclaw CLI 推播 Telegram。

**Tech Stack:** Node.js, Express SSE, `@anthropic-ai/sdk`, 現有 tsdbService/alertEngine，openclaw CLI（Telegram）

---

## Task 1: 安裝 Anthropic SDK

**Files:**
- Modify: `package.json`

**Step 1: 安裝套件**

```bash
cd /Users/openclaw/.openclaw/shared/projects/agent-monitor-web
npm install @anthropic-ai/sdk
```

Expected: `package.json` 的 `dependencies` 新增 `"@anthropic-ai/sdk": "^0.x.x"`

**Step 2: 確認 .env 有欄位（不填值，只確認格式）**

檢查 `.env` 是否已有 `ANTHROPIC_API_KEY=`，若無則新增一行：
```
ANTHROPIC_API_KEY=
```
（實際 key 由使用者自行填入）

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @anthropic-ai/sdk dependency"
```

---

## Task 2: optimizeService.js — 數據收集

**Files:**
- Create: `src/backend/services/optimizeService.js`
- Test: `tests/optimizeService.test.js`

**Step 1: 寫失敗測試**

```js
// tests/optimizeService.test.js
jest.mock('@anthropic-ai/sdk');
jest.mock('../src/backend/services/tsdbService', () => ({
    getCostHistory: jest.fn(() => []),
    getAgentActivitySummary: jest.fn(() => []),
}));
jest.mock('../src/backend/services/alertEngine', () => ({
    getRecent: jest.fn(() => []),
}));
jest.mock('../src/backend/services/openclawService', () => ({
    listAgents: jest.fn(async () => []),
}));

const optimizeService = require('../src/backend/services/optimizeService');

describe('optimizeService.collectData', () => {
    it('returns object with costHistory, alerts, sessions, existingPlans', async () => {
        const data = await optimizeService.collectData();
        expect(data).toHaveProperty('costHistory');
        expect(data).toHaveProperty('alerts');
        expect(data).toHaveProperty('agents');
        expect(data).toHaveProperty('existingPlans');
        expect(Array.isArray(data.existingPlans)).toBe(true);
    });
});
```

**Step 2: 跑測試確認失敗**

```bash
npm test -- --testPathPattern=optimizeService
```

Expected: FAIL — "Cannot find module optimizeService"

**Step 3: 建立 optimizeService.js，實作 collectData**

```js
// src/backend/services/optimizeService.js
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

const PROJECT_PATH = path.join(os.homedir(), '.openclaw', 'shared', 'projects', 'agent-monitor-web');
const PLANS_DIR = path.join(PROJECT_PATH, 'docs', 'plans');
const OPENCLAW_PATH = path.join(os.homedir(), '.openclaw', 'bin', 'openclaw');

const tsdbService = require('./tsdbService');
const alertEngine = require('./alertEngine');
const openclawService = require('./openclawService');

async function collectData() {
    const [costHistory, agents, alerts] = await Promise.all([
        Promise.resolve(tsdbService.getCostHistory ? tsdbService.getCostHistory(60) : []),
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

module.exports = { collectData, PROJECT_PATH, OPENCLAW_PATH };
```

**Step 4: 跑測試確認通過**

```bash
npm test -- --testPathPattern=optimizeService
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/backend/services/optimizeService.js tests/optimizeService.test.js
git commit -m "feat(optimize): collectData — tsdb + alerts + agents + existing plans"
```

---

## Task 3: optimizeService.js — 三步 Claude Pipeline

**Files:**
- Modify: `src/backend/services/optimizeService.js`
- Modify: `tests/optimizeService.test.js`

**Step 1: 新增測試（mock Anthropic SDK 三次呼叫）**

在 `tests/optimizeService.test.js` 加入：

```js
const Anthropic = require('@anthropic-ai/sdk');

describe('optimizeService pipeline', () => {
    beforeEach(() => {
        process.env.ANTHROPIC_API_KEY = 'test-key';
        Anthropic.mockImplementation(() => ({
            messages: {
                create: jest.fn()
                    .mockResolvedValueOnce({ content: [{ text: '## 草案\n優化項目A' }] })
                    .mockResolvedValueOnce({ content: [{ text: '## Opus審查\n問題1' }] })
                    .mockResolvedValueOnce({ content: [{ text: '## 最終報告\n整合完成' }] }),
            }
        }));
    });

    it('runPipeline returns { draft, review, report }', async () => {
        const data = { costHistory: [], agents: [], alerts: [], existingPlans: [] };
        const result = await optimizeService.runPipeline(data, () => {});
        expect(result).toHaveProperty('draft');
        expect(result).toHaveProperty('review');
        expect(result).toHaveProperty('report');
        expect(result.report).toContain('最終報告');
    });

    it('runPipeline opus failure falls back to draft-only report', async () => {
        Anthropic.mockImplementation(() => ({
            messages: {
                create: jest.fn()
                    .mockResolvedValueOnce({ content: [{ text: '## 草案' }] })
                    .mockRejectedValueOnce(new Error('Opus quota'))
                    .mockResolvedValueOnce({ content: [{ text: '## 降級報告' }] }),
            }
        }));
        const data = { costHistory: [], agents: [], alerts: [], existingPlans: [] };
        const result = await optimizeService.runPipeline(data, () => {});
        expect(result.report).toContain('降級');
        expect(result.opusFailed).toBe(true);
    });

    it('throws if ANTHROPIC_API_KEY not set', async () => {
        delete process.env.ANTHROPIC_API_KEY;
        const data = { costHistory: [], agents: [], alerts: [], existingPlans: [] };
        await expect(optimizeService.runPipeline(data, () => {})).rejects.toThrow('ANTHROPIC_API_KEY');
    });
});
```

**Step 2: 跑測試確認失敗**

```bash
npm test -- --testPathPattern=optimizeService
```

Expected: FAIL — "runPipeline is not a function"

**Step 3: 實作 runPipeline（在 optimizeService.js 加入）**

```js
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

    const existingList = data.existingPlans.join('\n');

    // Step 2: Sonnet 起草
    onProgress(2, 'Sonnet 起草中...');
    const draftResp = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: SYSTEM_SONNET_DRAFT.replace('{DATE}', TODAY()).replace('{EXISTING_PLANS}', existingList),
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
    const integrateResp = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 6000,
        system: SYSTEM_SONNET_INTEGRATE + (opusFailed ? '\n\n注意：本報告未經 Opus 完整審查，請標註「[未經 Opus 審查]」。' : ''),
        messages: [{ role: 'user', content: `草案：\n${draft}\n\nOpus審查：\n${review}` }],
    });
    const report = integrateResp.content[0].text;

    return { draft, review, report, opusFailed };
}

module.exports = { collectData, runPipeline, PROJECT_PATH, OPENCLAW_PATH };
```

**Step 4: 跑測試確認通過**

```bash
npm test -- --testPathPattern=optimizeService
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/backend/services/optimizeService.js tests/optimizeService.test.js
git commit -m "feat(optimize): runPipeline — Sonnet draft → Opus review → Sonnet integrate"
```

---

## Task 4: optimizeService.js — 儲存 + Telegram

**Files:**
- Modify: `src/backend/services/optimizeService.js`
- Modify: `tests/optimizeService.test.js`

**Step 1: 新增測試**

```js
const { execFile } = require('child_process');
jest.mock('child_process');

describe('optimizeService.saveAndNotify', () => {
    it('saves report to docs/plans/ and returns filename', async () => {
        const writeSpy = jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
        execFile.mockImplementation((bin, args, opts, cb) => cb(null, '', ''));

        const { filename } = await optimizeService.saveAndNotify(
            '## 最終報告\n項目A',
            false,
            () => {}
        );
        expect(filename).toMatch(/^\d{4}-\d{2}-\d{2}-auto-optimize\.md$/);
        writeSpy.mockRestore();
    });

    it('does not throw if Telegram fails', async () => {
        jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
        execFile.mockImplementation((bin, args, opts, cb) => cb(new Error('Telegram fail'), '', ''));

        await expect(
            optimizeService.saveAndNotify('## 報告', false, () => {})
        ).resolves.not.toThrow();
    });
});
```

**Step 2: 跑測試確認失敗**

```bash
npm test -- --testPathPattern=optimizeService
```

Expected: FAIL — "saveAndNotify is not a function"

**Step 3: 實作 saveAndNotify（在 optimizeService.js 加入）**

```js
const { execFile } = require('child_process');

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
        // Telegram 失敗不中斷
    }

    return { filename, filepath };
}

module.exports = { collectData, runPipeline, saveAndNotify, PROJECT_PATH, OPENCLAW_PATH };
```

**Step 4: 跑測試確認通過**

```bash
npm test -- --testPathPattern=optimizeService
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/backend/services/optimizeService.js tests/optimizeService.test.js
git commit -m "feat(optimize): saveAndNotify — write report to docs/plans, push Telegram"
```

---

## Task 5: optimizeController.js — SSE endpoint

**Files:**
- Create: `src/backend/controllers/optimizeController.js`
- Create: `tests/optimizeController.test.js`

**Step 1: 寫失敗測試**

```js
// tests/optimizeController.test.js
const request = require('supertest');
const express = require('express');

jest.mock('../src/backend/services/optimizeService', () => ({
    collectData: jest.fn(async () => ({ costHistory: [], agents: [], alerts: [], existingPlans: [] })),
    runPipeline: jest.fn(async (data, cb) => {
        cb(2, 'Sonnet 起草中...');
        cb(3, 'Opus 審查中...');
        cb(4, 'Sonnet 整合中...');
        return { draft: 'draft', review: 'review', report: '## Report', opusFailed: false };
    }),
    saveAndNotify: jest.fn(async (report, failed, cb) => {
        cb(5, '儲存報告...');
        cb(6, 'Telegram 推播...');
        return { filename: '2026-03-05-auto-optimize.md' };
    }),
}));

const optimizeController = require('../src/backend/controllers/optimizeController');

function buildApp() {
    const app = express();
    app.get('/api/optimize/run', optimizeController.run);
    return app;
}

describe('optimizeController.run', () => {
    it('streams SSE progress events and done event', async () => {
        const res = await request(buildApp())
            .get('/api/optimize/run')
            .buffer(true)
            .parse((res, cb) => {
                let data = '';
                res.on('data', chunk => { data += chunk; });
                res.on('end', () => cb(null, data));
            });

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(/text\/event-stream/);
        expect(res.text).toContain('event: progress');
        expect(res.text).toContain('event: done');
        expect(res.text).toContain('2026-03-05-auto-optimize.md');
    });

    it('returns 409 if already running', async () => {
        const app = buildApp();
        // 模擬 running 狀態
        optimizeController._setRunning(true);
        const res = await request(app).get('/api/optimize/run');
        expect(res.status).toBe(409);
        optimizeController._setRunning(false);
    });

    it('streams error event on exception', async () => {
        const optimizeService = require('../src/backend/services/optimizeService');
        optimizeService.collectData.mockRejectedValueOnce(new Error('DB error'));

        const res = await request(buildApp())
            .get('/api/optimize/run')
            .buffer(true)
            .parse((res, cb) => {
                let data = '';
                res.on('data', chunk => { data += chunk; });
                res.on('end', () => cb(null, data));
            });

        expect(res.text).toContain('event: error');
        expect(res.text).toContain('DB error');
    });
});
```

**Step 2: 跑測試確認失敗**

```bash
npm test -- --testPathPattern=optimizeController
```

Expected: FAIL — "Cannot find module optimizeController"

**Step 3: 實作 optimizeController.js**

```js
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
```

**Step 4: 跑測試確認通過**

```bash
npm test -- --testPathPattern=optimizeController
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/backend/controllers/optimizeController.js tests/optimizeController.test.js
git commit -m "feat(optimize): SSE controller — progress stream, 409 guard, error event"
```

---

## Task 6: API Route 掛載

**Files:**
- Modify: `src/backend/routes/api.js`

**Step 1: 在 api.js 加入 optimizeController**

在 `const alertController = require('../controllers/alertController');` 下方加一行：
```js
const optimizeController = require('../controllers/optimizeController');
```

在 `// Alerts` 路由區塊之後加入：
```js
// Optimize
router.get('/optimize/run', auth.localhostOnlyControl, optimizeController.run);
```

**Step 2: 全量測試**

```bash
npm test
```

Expected: 所有測試通過（數量 ≥ 前一次 + 新增測試數）

**Step 3: Commit**

```bash
git add src/backend/routes/api.js
git commit -m "feat(optimize): mount GET /api/optimize/run route"
```

---

## Task 7: 前端 UI — 按鈕 + 進度顯示

**Files:**
- Modify: `src/frontend/public/index.html`
- Modify: `src/frontend/public/js/app.js`

**Step 1: 在 index.html System tab 加入按鈕和進度容器**

找到 System tab 的 `<div class="tab-content" id="tab-system">` 區塊頂部（或適當操作按鈕區），加入：

```html
<div id="optimizeSection" style="margin-bottom:16px;">
    <button id="optimizeBtn" class="header-btn" onclick="runAutoOptimize()">
        🔍 執行自主優化
    </button>
    <div id="optimizeProgress" style="display:none; margin-top:12px;"></div>
</div>
```

**Step 2: 在 app.js 加入 runAutoOptimize 函式**

```js
function runAutoOptimize() {
    const btn = document.getElementById('optimizeBtn');
    const progressEl = document.getElementById('optimizeProgress');
    if (!btn || !progressEl) return;

    btn.disabled = true;
    btn.textContent = '⏳ 優化進行中...';
    progressEl.style.display = 'block';
    progressEl.innerHTML = '';

    const steps = ['', '', '收集數據', 'Sonnet起草', 'Opus審查', 'Sonnet整合', '儲存報告', 'Telegram推播'];
    function addStep(step, msg, done) {
        const id = 'opt-step-' + step;
        let el = document.getElementById(id);
        if (!el) {
            el = document.createElement('div');
            el.id = id;
            el.style.cssText = 'padding:4px 0; font-size:13px; color:var(--text-secondary)';
            progressEl.appendChild(el);
        }
        el.textContent = (done ? '✅ ' : '⏳ ') + msg;
    }

    const es = new EventSource('/api/optimize/run');

    es.addEventListener('progress', (e) => {
        try {
            const { step, msg } = JSON.parse(e.data);
            addStep(step, msg, false);
            if (step > 1) {
                const prev = document.getElementById('opt-step-' + (step - 1));
                if (prev) prev.textContent = '✅ ' + prev.textContent.slice(3);
            }
        } catch (_) {}
    });

    es.addEventListener('done', (e) => {
        try {
            const { filename, opusFailed } = JSON.parse(e.data);
            // 最後一步打勾
            ['5','6'].forEach(n => {
                const el = document.getElementById('opt-step-' + n);
                if (el && el.textContent.startsWith('⏳')) el.textContent = '✅ ' + el.textContent.slice(3);
            });
            const result = document.createElement('div');
            result.style.cssText = 'margin-top:8px; padding:8px; background:var(--bg-muted); border-radius:6px; font-size:13px;';
            result.innerHTML = `✅ 報告已生成：<strong>${filename}</strong>` +
                (opusFailed ? ' <span style="color:var(--text-muted)">(未經Opus審查)</span>' : '');
            progressEl.appendChild(result);
        } catch (_) {}
        btn.disabled = false;
        btn.textContent = '🔍 執行自主優化';
        es.close();
    });

    es.addEventListener('error', (e) => {
        try {
            const { msg } = JSON.parse(e.data);
            const errEl = document.createElement('div');
            errEl.style.cssText = 'color:var(--red); margin-top:8px; font-size:13px;';
            errEl.textContent = '❌ ' + msg;
            progressEl.appendChild(errEl);
        } catch (_) {}
        btn.disabled = false;
        btn.textContent = '🔍 執行自主優化';
        es.close();
    });

    es.onerror = () => {
        btn.disabled = false;
        btn.textContent = '🔍 執行自主優化';
        es.close();
    };
}
```

**Step 3: 全量測試**

```bash
npm test
```

Expected: PASS（前端無 Jest 測試，確認 backend 全過）

**Step 4: Commit**

```bash
git add src/frontend/public/index.html src/frontend/public/js/app.js
git commit -m "feat(optimize): UI button + SSE progress display in System tab"
```

---

## Task 8: Push + CI + Issue

**Step 1: 開 GitHub Issue**

```bash
gh issue create --title "feat: auto-optimize — Sonnet draft → Opus review → integrated report" \
  --body "UI 按鈕觸發自主優化 pipeline：收集 TSDB/alert 數據 → Sonnet 起草 → Opus 審查 → Sonnet 整合 → 儲存 docs/plans/ + Telegram 推播"
```

記下 issue 號碼（例如 #66）

**Step 2: Push**

```bash
git push origin main
```

**Step 3: 監控 CI**

```bash
gh run list --limit 5
gh run watch
```

Expected: 所有 checks 通過

**Step 4: Close Issue**

```bash
gh issue close <issue-number> --comment "Implemented in $(git log -1 --format='%H')"
```

---

## Manual Verification Checklist

- [ ] System tab 顯示「🔍 執行自主優化」按鈕
- [ ] 按下後按鈕禁用，進度列表依序出現
- [ ] 每步完成後圖示從 ⏳ 變 ✅
- [ ] 完成後顯示報告檔名
- [ ] `docs/plans/YYYY-MM-DD-auto-optimize.md` 存在且內容完整
- [ ] 報告含 `[Opus 修訂]` 標記
- [ ] Telegram 收到推播摘要
- [ ] Opus 失敗時：報告標註「未經 Opus 審查」，流程不中斷
- [ ] 執行中再按：回傳 409，UI 無反應
