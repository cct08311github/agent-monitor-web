# System Optimization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 漸進式優化監控系統，依序完成警報引擎、效能修正、前端模組拆解、功能補完。

**Architecture:** 四個獨立 Phase（P0–P3），每個 Phase 為獨立 PR，可單獨回滾。P0 警報系統在後端新增 `alertEngine` service，透過現有 SSE 管道推播到前端。P1/P2/P3 全部為局部修改，不動主架構。

**Tech Stack:** Node.js, Express, better-sqlite3, Jest + supertest, 純 HTML/CSS/JS 前端（無 bundler）

---

## P0 — 警報系統 + 閾值 UI

### Task 1: AlertEngine 核心 service

**Files:**
- Create: `src/backend/services/alertEngine.js`
- Test: `tests/alertEngine.test.js`

**Step 1: 寫失敗測試**

```js
// tests/alertEngine.test.js
const alertEngine = require('../src/backend/services/alertEngine');

describe('AlertEngine', () => {
    beforeEach(() => alertEngine.resetForTesting());

    it('triggers cpu_high warning when cpu > 80', () => {
        const alerts = alertEngine.evaluate({ sys: { cpu: 85, memory: 50, disk: 40 }, agents: [] });
        expect(alerts.some(a => a.rule === 'cpu_high' && a.severity === 'warning')).toBe(true);
    });

    it('triggers cpu_critical when cpu > 95', () => {
        const alerts = alertEngine.evaluate({ sys: { cpu: 96, memory: 50, disk: 40 }, agents: [] });
        expect(alerts.some(a => a.rule === 'cpu_critical' && a.severity === 'critical')).toBe(true);
    });

    it('triggers memory_high when memory > 85', () => {
        const alerts = alertEngine.evaluate({ sys: { cpu: 20, memory: 90, disk: 40 }, agents: [] });
        expect(alerts.some(a => a.rule === 'memory_high')).toBe(true);
    });

    it('triggers no_active_agents when agents drop from >0 to 0', () => {
        alertEngine.evaluate({ sys: { cpu: 20, memory: 50, disk: 40 }, agents: [{ status: 'active_executing' }] });
        const alerts = alertEngine.evaluate({ sys: { cpu: 20, memory: 50, disk: 40 }, agents: [] });
        expect(alerts.some(a => a.rule === 'no_active_agents')).toBe(true);
    });

    it('respects cooldown: same rule does not fire twice within 5 minutes', () => {
        alertEngine.evaluate({ sys: { cpu: 96, memory: 50, disk: 40 }, agents: [] });
        const second = alertEngine.evaluate({ sys: { cpu: 97, memory: 50, disk: 40 }, agents: [] });
        expect(second.some(a => a.rule === 'cpu_critical')).toBe(false);
    });

    it('getRecent returns last N alerts', () => {
        alertEngine.evaluate({ sys: { cpu: 85, memory: 50, disk: 40 }, agents: [] });
        expect(alertEngine.getRecent(10).length).toBeGreaterThan(0);
    });
});
```

**Step 2: 跑測試確認失敗**

```bash
npm test -- --testPathPattern=alertEngine
```

Expected: 6 failures（alertEngine not found）

**Step 3: 實作 alertEngine.js**

```js
// src/backend/services/alertEngine.js
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '../../../data/alert-config.json');

const DEFAULT_CONFIG = {
    rules: {
        cpu_high:          { enabled: true, threshold: 80,  severity: 'warning',  label: 'CPU 偏高' },
        cpu_critical:      { enabled: true, threshold: 95,  severity: 'critical', label: 'CPU 危急' },
        memory_high:       { enabled: true, threshold: 85,  severity: 'warning',  label: '記憶體偏高' },
        no_active_agents:  { enabled: true, threshold: 0,   severity: 'critical', label: 'Agent 全部離線' },
        agent_went_offline:{ enabled: true, threshold: 0,   severity: 'info',     label: 'Agent 離線' },
    }
};

const COOLDOWN_MS = 5 * 60 * 1000;
const MAX_BUFFER = 50;

let config = loadConfig();
let cooldowns = {};
let alertsBuffer = [];
let prevActiveCount = -1;

function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
        }
    } catch (e) { /* use default */ }
    return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
}

function saveConfig() {
    try { fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2)); } catch (e) { /* ignore */ }
}

function getConfig() { return config; }

function updateConfig(patch) {
    for (const [rule, updates] of Object.entries(patch.rules || {})) {
        if (config.rules[rule]) Object.assign(config.rules[rule], updates);
    }
    saveConfig();
    return config;
}

function canFire(rule) {
    const now = Date.now();
    if (cooldowns[rule] && now - cooldowns[rule] < COOLDOWN_MS) return false;
    cooldowns[rule] = now;
    return true;
}

function fire(rule, message, severity, meta = {}) {
    const alert = { rule, severity, message, meta, ts: Date.now() };
    alertsBuffer.unshift(alert);
    if (alertsBuffer.length > MAX_BUFFER) alertsBuffer.pop();
    return alert;
}

function evaluate(payload) {
    const fired = [];
    const rules = config.rules;
    const sys = payload.sys || {};
    const agents = payload.agents || [];

    if (rules.cpu_critical?.enabled && sys.cpu > rules.cpu_critical.threshold && canFire('cpu_critical')) {
        fired.push(fire('cpu_critical', `CPU ${sys.cpu.toFixed(1)}% — 超過危急閾值 ${rules.cpu_critical.threshold}%`, 'critical', { cpu: sys.cpu }));
    } else if (rules.cpu_high?.enabled && sys.cpu > rules.cpu_high.threshold && canFire('cpu_high')) {
        fired.push(fire('cpu_high', `CPU ${sys.cpu.toFixed(1)}% — 超過警告閾值 ${rules.cpu_high.threshold}%`, 'warning', { cpu: sys.cpu }));
    }

    if (rules.memory_high?.enabled && sys.memory > rules.memory_high.threshold && canFire('memory_high')) {
        fired.push(fire('memory_high', `記憶體 ${sys.memory.toFixed(1)}% — 超過閾值 ${rules.memory_high.threshold}%`, 'warning', { memory: sys.memory }));
    }

    const activeNow = agents.filter(a => a.status?.includes('active')).length;
    if (prevActiveCount > 0 && activeNow === 0 && rules.no_active_agents?.enabled && canFire('no_active_agents')) {
        fired.push(fire('no_active_agents', '所有 Agent 已離線', 'critical', { prev: prevActiveCount }));
    }
    prevActiveCount = activeNow;

    return fired;
}

function getRecent(limit = 50) { return alertsBuffer.slice(0, limit); }

function resetForTesting() {
    cooldowns = {};
    alertsBuffer = [];
    prevActiveCount = -1;
    config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
}

module.exports = { evaluate, getConfig, updateConfig, getRecent, resetForTesting };
```

**Step 4: 跑測試確認通過**

```bash
npm test -- --testPathPattern=alertEngine
```

Expected: 6 tests PASS

**Step 5: Commit**

```bash
git add src/backend/services/alertEngine.js tests/alertEngine.test.js
git commit -m "feat(p0): add AlertEngine service with threshold evaluation and cooldown"
```

---

### Task 2: AlertController + API routes

**Files:**
- Create: `src/backend/controllers/alertController.js`
- Modify: `src/backend/routes/api.js`
- Test: `tests/alertController.test.js`

**Step 1: 寫失敗測試**

```js
// tests/alertController.test.js
const request = require('supertest');
const app = require('../src/backend/app');

describe('Alert API', () => {
    it('GET /api/alerts/config returns config with rules', async () => {
        const res = await request(app).get('/api/alerts/config');
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.config.rules).toBeDefined();
        expect(res.body.config.rules.cpu_high).toBeDefined();
    });

    it('PATCH /api/alerts/config updates a threshold', async () => {
        const res = await request(app)
            .patch('/api/alerts/config')
            .send({ rules: { cpu_high: { threshold: 75 } } });
        expect(res.statusCode).toBe(200);
        expect(res.body.config.rules.cpu_high.threshold).toBe(75);
    });

    it('GET /api/alerts/recent returns array', async () => {
        const res = await request(app).get('/api/alerts/recent');
        expect(res.statusCode).toBe(200);
        expect(Array.isArray(res.body.alerts)).toBe(true);
    });
});
```

**Step 2: 跑測試確認失敗**

```bash
npm test -- --testPathPattern=alertController
```

**Step 3: 實作 alertController.js**

```js
// src/backend/controllers/alertController.js
const alertEngine = require('../services/alertEngine');

function getConfig(req, res) {
    res.json({ success: true, config: alertEngine.getConfig() });
}

function updateConfig(req, res) {
    try {
        const updated = alertEngine.updateConfig(req.body || {});
        res.json({ success: true, config: updated });
    } catch (e) {
        res.status(400).json({ success: false, error: e.message });
    }
}

function getRecent(req, res) {
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    res.json({ success: true, alerts: alertEngine.getRecent(limit) });
}

module.exports = { getConfig, updateConfig, getRecent };
```

**Step 4: 在 api.js 新增路由**

在 `src/backend/routes/api.js` 頂部 require 區塊加入：

```js
const alertController = require('../controllers/alertController');
```

在 `router.get('/read/health', ...)` 之後加入：

```js
// Alerts
router.get('/alerts/config', alertController.getConfig);
router.patch('/alerts/config', auth.localhostOnlyControl, auth.rateLimit, alertController.updateConfig);
router.get('/alerts/recent', alertController.getRecent);
```

**Step 5: 跑測試**

```bash
npm test -- --testPathPattern=alertController
```

Expected: 3 tests PASS

**Step 6: Commit**

```bash
git add src/backend/controllers/alertController.js src/backend/routes/api.js tests/alertController.test.js
git commit -m "feat(p0): add alert config/recent API endpoints"
```

---

### Task 3: Hook AlertEngine into dashboard poller + SSE broadcast

**Files:**
- Modify: `src/backend/controllers/legacyDashboardController.js`

**Step 1: 在檔案頂部 require 區塊加入**

```js
const alertEngine = require('../services/alertEngine');
```

**Step 2: 在 `updateSharedData()` 的 `return true` 之前插入 alert hook**

找到 `tsdbService.saveSnapshot(...)` 呼叫之後，`return true` 之前，加入：

```js
// Alert evaluation — push to SSE if any fired
const firedAlerts = alertEngine.evaluate(sharedPayload);
if (firedAlerts.length > 0) {
    const alertStr = `event: alert\ndata: ${JSON.stringify({ alerts: firedAlerts })}\n\n`;
    sseClients.forEach((client) => client.write(alertStr));
}
```

**Step 3: 手動測試**

```bash
npm start
# 開 browser console:
# const es = new EventSource('/api/read/stream');
# es.addEventListener('alert', e => console.log(JSON.parse(e.data)));
# 暫時把 cpu_high threshold 改為 0 via PATCH /api/alerts/config
```

**Step 4: Commit**

```bash
git add src/backend/controllers/legacyDashboardController.js
git commit -m "feat(p0): hook alertEngine into SSE poller broadcast"
```

---

### Task 4: 前端警報 UI（Toast + Badge + 設定 Modal）

**Files:**
- Modify: `src/frontend/public/js/app.js`
- Modify: `src/frontend/public/index.html`
- Modify: `src/frontend/public/css/style.css`

**Step 1: app.js — `initRealtime()` 加入 alert SSE handler**

找到 `initRealtime()` 函式，在 `es.onmessage = ...` 之後加入：

```js
es.addEventListener('alert', (e) => {
    try {
        const { alerts } = JSON.parse(e.data);
        alerts.forEach(a => {
            const type = a.severity === 'critical' ? 'error' : (a.severity === 'warning' ? 'warning' : 'info');
            showToast(`🚨 ${a.message}`, type);
            pushLog(`[ALERT] ${a.message}`, a.severity === 'critical' ? 'err' : 'warn');
        });
        incrementAlertBadge(alerts.length);
    } catch (x) { }
});
```

**Step 2: app.js — 在 `closeSREModal()` 之後加入 badge 和 modal 函式**

```js
// --- Alert Badge ---
let unreadAlertCount = 0;
function incrementAlertBadge(n) {
    unreadAlertCount += n;
    const badge = document.getElementById('alertBadge');
    if (badge) { badge.textContent = unreadAlertCount; badge.style.display = 'inline-block'; }
}
function clearAlertBadge() {
    unreadAlertCount = 0;
    const badge = document.getElementById('alertBadge');
    if (badge) badge.style.display = 'none';
}

// --- Alert Config Modal ---
async function openAlertConfig() {
    clearAlertBadge();
    try {
        const res = await fetch('/api/alerts/config');
        const { config } = await res.json();
        const modal = document.getElementById('alertConfigModal');
        const tbody = document.getElementById('alertConfigBody');

        // Build table rows using safe DOM manipulation (no innerHTML with untrusted data)
        tbody.textContent = '';
        for (const [rule, r] of Object.entries(config.rules)) {
            const tr = document.createElement('tr');

            const tdLabel = document.createElement('td');
            tdLabel.textContent = r.label;

            const tdThr = document.createElement('td');
            const inp = document.createElement('input');
            inp.type = 'number'; inp.id = `thr_${rule}`; inp.value = r.threshold;
            inp.min = 0; inp.max = 100; inp.style.width = '60px';
            tdThr.appendChild(inp);

            const tdSev = document.createElement('td');
            const pill = document.createElement('span');
            pill.className = `alert-severity ${r.severity}`;
            pill.textContent = r.severity;
            tdSev.appendChild(pill);

            const tdEn = document.createElement('td');
            const label = document.createElement('label');
            label.className = 'toggle-switch';
            const cb = document.createElement('input');
            cb.type = 'checkbox'; cb.id = `en_${rule}`; cb.checked = r.enabled;
            const slider = document.createElement('span');
            slider.className = 'toggle-slider';
            label.appendChild(cb); label.appendChild(slider);
            tdEn.appendChild(label);

            tr.appendChild(tdLabel); tr.appendChild(tdThr);
            tr.appendChild(tdSev); tr.appendChild(tdEn);
            tbody.appendChild(tr);
        }
        modal.style.display = 'flex';
    } catch (e) { showToast('載入設定失敗', 'error'); }
}

function closeAlertConfig() {
    document.getElementById('alertConfigModal').style.display = 'none';
}

async function saveAlertConfig() {
    try {
        const res = await fetch('/api/alerts/config');
        const { config } = await res.json();
        const patch = { rules: {} };
        for (const rule of Object.keys(config.rules)) {
            patch.rules[rule] = {
                threshold: parseFloat(document.getElementById(`thr_${rule}`)?.value ?? config.rules[rule].threshold),
                enabled: document.getElementById(`en_${rule}`)?.checked ?? config.rules[rule].enabled,
            };
        }
        await fetch('/api/alerts/config', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patch)
        });
        showToast('✅ 警報設定已儲存', 'success');
        closeAlertConfig();
    } catch (e) { showToast('儲存失敗', 'error'); }
}
```

**Step 3: index.html — 加入警報按鈕到導覽列**

在 dashboard 標題列（找 `class="dashboard-header"` 或類似的頂部導覽區）加入：

```html
<button onclick="openAlertConfig()" class="alert-config-btn" title="警報設定">
    🔔 <span id="alertBadge" class="alert-badge" style="display:none">0</span>
</button>
```

**Step 4: index.html — 在 `</body>` 前加入 modal HTML**

```html
<div id="alertConfigModal" style="display:none" class="modal-overlay" onclick="if(event.target===this)closeAlertConfig()">
    <div class="modal-box" style="max-width:520px">
        <div class="modal-header">
            <span>🔔 警報閾值設定</span>
            <button class="modal-close" onclick="closeAlertConfig()">✕</button>
        </div>
        <div class="modal-body">
            <table class="alert-config-table">
                <thead><tr><th>指標</th><th>閾值 (%)</th><th>嚴重度</th><th>啟用</th></tr></thead>
                <tbody id="alertConfigBody"></tbody>
            </table>
        </div>
        <div class="modal-footer">
            <button class="btn-primary" onclick="saveAlertConfig()">儲存</button>
            <button class="btn-secondary" onclick="closeAlertConfig()">取消</button>
        </div>
    </div>
</div>
```

**Step 5: style.css — 新增樣式**

```css
/* Alert badge */
.alert-config-btn { position: relative; background: var(--bg-card); border: 1px solid var(--border); border-radius: 6px; padding: 4px 10px; cursor: pointer; font-size: 14px; color: var(--text-primary); }
.alert-badge { position: absolute; top: -6px; right: -6px; background: var(--red); color: #fff; border-radius: 10px; font-size: 10px; min-width: 16px; height: 16px; line-height: 16px; text-align: center; padding: 0 3px; }
.alert-severity { border-radius: 4px; padding: 2px 6px; font-size: 11px; font-weight: 600; }
.alert-severity.warning { background: var(--orange-light, #fff3cd); color: var(--orange, #e67e22); }
.alert-severity.critical { background: var(--red-light, #fde8e8); color: var(--red, #e74c3c); }
.alert-severity.info { background: var(--blue-light, #e8f4fd); color: var(--blue, #2980b9); }
.alert-config-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.alert-config-table th { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--border); color: var(--text-muted); font-weight: 500; }
.alert-config-table td { padding: 8px; border-bottom: 1px solid var(--border-light, var(--border)); }
.toggle-switch { position: relative; display: inline-block; width: 36px; height: 20px; }
.toggle-switch input { opacity: 0; width: 0; height: 0; }
.toggle-slider { position: absolute; cursor: pointer; inset: 0; background: var(--bg-hover, #ccc); border-radius: 20px; transition: .2s; }
.toggle-slider:before { content: ''; position: absolute; height: 14px; width: 14px; left: 3px; bottom: 3px; background: #fff; border-radius: 50%; transition: .2s; }
input:checked + .toggle-slider { background: var(--green, #27ae60); }
input:checked + .toggle-slider:before { transform: translateX(16px); }
```

**Step 6: 手動驗證**

1. `npm start` → http://localhost:3000
2. 點「🔔」→ modal 出現，列出所有規則
3. 調整 cpu_high threshold 為 0 → 儲存
4. 確認 toast 出現 → 重整頁面 → 再開 modal → 確認 threshold 仍為 0
5. 把 threshold 改回 80

**Step 7: Commit**

```bash
git add src/frontend/public/js/app.js src/frontend/public/index.html src/frontend/public/css/style.css
git commit -m "feat(p0): add alert badge, config modal, and SSE alert handler in frontend"
```

---

## P1 — 效能優化

### Task 5: In-flight 請求去重

**Files:**
- Modify: `src/backend/controllers/legacyDashboardController.js`

**Step 1: 在 `let sharedPayload = null;` 那行旁加入**

```js
let pendingUpdate = null;
```

**Step 2: 修改 `updateSharedData()`**

將現有函式：
```js
async function updateSharedData() {
    try {
        const payload = await buildDashboardPayload();
        // ...
    }
}
```

改為：
```js
async function updateSharedData() {
    if (pendingUpdate) return pendingUpdate;
    pendingUpdate = _doUpdateSharedData().finally(() => { pendingUpdate = null; });
    return pendingUpdate;
}

async function _doUpdateSharedData() {
    try {
        const payload = await buildDashboardPayload();
        // ... (原有的 try 區塊內容全部移到這裡)
    } catch (e) {
        console.error('[Poller] Update failed:', e);
        return false;
    }
}
```

**Step 3: 驗證**

```bash
# 開兩個 SSE 連線
curl -N http://localhost:3000/api/read/stream &
curl -N http://localhost:3000/api/read/stream &
# server log 應只顯示一次 buildDashboardPayload 執行
```

**Step 4: Commit**

```bash
git add src/backend/controllers/legacyDashboardController.js
git commit -m "perf(p1): add in-flight request deduplication for dashboard updates"
```

---

### Task 6: OpenClaw 版本靜態 cache

**Files:**
- Modify: `src/backend/controllers/legacyDashboardController.js`

**Step 1: 在模組頂部變數區加入**

```js
let cachedOcVersion = null;
```

**Step 2: 在 `buildDashboardPayload()` 的 `Promise.all` 裡修改版本取得**

將：
```js
execFilePromise(ocBin, ['--version']).catch(() => ({ stdout: '' })),
```

改為：
```js
cachedOcVersion
    ? Promise.resolve({ stdout: cachedOcVersion, stderr: '' })
    : execFilePromise(ocBin, ['--version']).catch(() => ({ stdout: '' })),
```

在 `const openclawVersion = parseOpenclawVersionOutput(...)` 之後加入：

```js
if (openclawVersion && !cachedOcVersion) cachedOcVersion = openclawVersion;
```

**Step 3: Commit**

```bash
git add src/backend/controllers/legacyDashboardController.js
git commit -m "perf(p1): cache openclaw version across dashboard refreshes"
```

---

### Task 7: File watcher debounce

**Files:**
- Modify: `src/backend/controllers/legacyDashboardController.js`

**Step 1: 找到 `startGlobalPolling()` 的 watcher event handler**

```js
agentWatcherService.on('state_update', async () => {
    await updateSharedData();
    doBroadcast();
});
```

**Step 2: 加入 debounce**

```js
let watcherDebounceTimer = null;
agentWatcherService.on('state_update', () => {
    clearTimeout(watcherDebounceTimer);
    watcherDebounceTimer = setTimeout(async () => {
        await updateSharedData();
        doBroadcast();
    }, 300);
});
```

**Step 3: Commit**

```bash
git add src/backend/controllers/legacyDashboardController.js
git commit -m "perf(p1): debounce file watcher events to prevent rapid-fire updates"
```

---

## P2 — app.js 模組拆解

> **原則**：只移動函式，不改邏輯。全部維持全域函式。每步驗證完才繼續。

### Task 8: 建立 modules/logs.js

**Files:**
- Create: `src/frontend/public/js/modules/logs.js`
- Modify: `src/frontend/public/js/app.js`（刪除已移走的函式）
- Modify: `src/frontend/public/index.html`

**Step 1: 建立目錄**

```bash
mkdir -p src/frontend/public/js/modules
```

**Step 2: 從 app.js 剪出以下函式到 modules/logs.js**

剪出範圍：`// --- OpenClaw Live Log Streaming ---` 到 `appendOcLogLine` 結尾（約第 39–120 行）

函式清單：`toggleOcLog`, `startOcLog`, `stopOcLog`, `clearOcLog`, `appendOcLogLine`

State 一併移走：`let ocLogSource = null;`, `let ocLogActive = false;`（如有）

**Step 3: index.html 在 `<script src="js/app.js">` 之前加入**

```html
<script src="js/modules/logs.js"></script>
```

**Step 4: 驗證**

```bash
npm start
# 打開 Logs tab → 點「啟動 OC Log」→ 確認 log 正常串流
```

**Step 5: Commit**

```bash
git add src/frontend/public/js/modules/logs.js src/frontend/public/js/app.js src/frontend/public/index.html
git commit -m "refactor(p2): extract OC log streaming into modules/logs.js"
```

---

### Task 9: 建立 modules/charts.js

**Step 1: 從 app.js 剪出**（約第 678–780 行）

函式：`drawSparkline`, `updateCharts`, `fetchHistory`, `updateCostDisplay`
State：`let sysHistoryData = [];`

**Step 2/3/4**: 同 Task 8（建檔、刪 app.js 對應內容、加 script tag）

**Step 5: 驗證**

```bash
npm start
# 打開 System tab → 確認 sparkline 圖表正常
```

**Step 6: Commit**

```bash
git add src/frontend/public/js/modules/charts.js src/frontend/public/js/app.js src/frontend/public/index.html
git commit -m "refactor(p2): extract charts and history into modules/charts.js"
```

---

### Task 10: 建立 modules/cron.js

**Step 1: 從 app.js 剪出**（約第 1345–1471 行）

函式：`fetchCronJobs`, `renderCronJobs`, `toggleCronJob`, `runCronJob`
State：`let cronJobsCache = [];`（如有）

**Step 2/3/4**: 同前

**Step 5: 驗證**

```bash
npm start
# Monitor → Cron tab → 確認 cron 列表、toggle、run 正常
```

**Step 6: Commit**

```bash
git add src/frontend/public/js/modules/cron.js src/frontend/public/js/app.js src/frontend/public/index.html
git commit -m "refactor(p2): extract cron job functions into modules/cron.js"
```

---

### Task 11: 建立 modules/chat.js

**Step 1: 從 app.js 剪出**（約第 202–622 行）

函式：`initChatPage`, `selectChatAgent`, `sendChatPage`, `appendChatPageMsg`,
`openChat`, `autoSendHi`, `closeChat`, `updateCharCount`, `autoGrowTextarea`,
`sendChat`, `openModelModal`, `closeModelModal`, `confirmModelSwitch`

State：`let chatPageHistory = [];`（如有）

**Step 2/3/4**: 同前

**Step 5: 驗證**

```bash
npm start
# 打開 Chat tab → 選 Agent → 輸入訊息 → 確認發送正常
```

**Step 6: Commit**

```bash
git add src/frontend/public/js/modules/chat.js src/frontend/public/js/app.js src/frontend/public/index.html
git commit -m "refactor(p2): extract chat and model switch into modules/chat.js"
```

---

### Task 12: 建立 modules/taskhub.js

**Step 1: 從 app.js 剪出**（約第 979–1343 行）

函式：`setThDomain`, `debounceThSearch`, `fetchTaskhubStats`, `renderTaskhubStats`,
`fetchTasks`, `renderTasks`, `buildQuickActions`, `isDueUrgent`,
`quickUpdateStatus`, `closeTaskDetailModal`, `openTaskDetail`,
`saveTaskEdit`, `confirmDeleteTask`, `openAddTaskModal`, `closeAddTaskModal`, `submitAddTask`

State：`let currentThDomain = 'all';`, `let thSearchTimer = null;`

**Step 2/3/4**: 同前

**Step 5: 驗證**

```bash
npm start
# Monitor → TaskHub tab → 確認任務列表/新增/編輯/刪除正常
```

**Step 6: Commit**

```bash
git add src/frontend/public/js/modules/taskhub.js src/frontend/public/js/app.js src/frontend/public/index.html
git commit -m "refactor(p2): extract TaskHub module into modules/taskhub.js"
```

---

## P3 — 功能補完

### Task 13: Log 搜尋過濾（4-A）

**Files:**
- Modify: `src/frontend/public/js/modules/logs.js`
- Modify: `src/frontend/public/index.html`
- Modify: `src/frontend/public/css/style.css`

**Step 1: logs.js 頂部加入 state**

```js
const LOG_BUFFER_MAX = 500;
let logBuffer = [];
let logFilterText = '';
let logShowError = false;
let logShowWarn = false;
```

**Step 2: 新增輔助函式**

```js
function detectLineLevel(line) {
    const l = line.toUpperCase();
    if (l.includes('ERROR') || l.includes('ERR ')) return 'error';
    if (l.includes('WARN')) return 'warn';
    return 'info';
}

function lineMatchesFilter(line) {
    const level = detectLineLevel(line);
    if (logShowError && level !== 'error') return false;
    if (logShowWarn && !['error', 'warn'].includes(level)) return false;
    if (logFilterText && !line.toLowerCase().includes(logFilterText.toLowerCase())) return false;
    return true;
}

// Safe DOM-based highlight (no innerHTML with user input)
function buildHighlightedNode(text, keyword) {
    const frag = document.createDocumentFragment();
    if (!keyword) { frag.appendChild(document.createTextNode(text)); return frag; }
    const lower = text.toLowerCase();
    const kLower = keyword.toLowerCase();
    let pos = 0;
    while (pos < text.length) {
        const idx = lower.indexOf(kLower, pos);
        if (idx === -1) { frag.appendChild(document.createTextNode(text.slice(pos))); break; }
        if (idx > pos) frag.appendChild(document.createTextNode(text.slice(pos, idx)));
        const mark = document.createElement('mark');
        mark.textContent = text.slice(idx, idx + keyword.length);
        frag.appendChild(mark);
        pos = idx + keyword.length;
    }
    return frag;
}

function applyLogFilter() {
    const terminal = document.getElementById('ocLogTerminal');
    if (!terminal) return;
    while (terminal.firstChild) terminal.removeChild(terminal.firstChild);
    logBuffer.filter(e => lineMatchesFilter(e.line)).forEach(e => {
        const div = document.createElement('div');
        div.className = `log-line ${e.level}`;
        div.appendChild(buildHighlightedNode(e.line, logFilterText));
        terminal.appendChild(div);
    });
    terminal.scrollTop = terminal.scrollHeight;
}

function setLogFilter(text) { logFilterText = text; applyLogFilter(); }

function toggleErrorOnly() {
    logShowError = !logShowError;
    if (logShowError) logShowWarn = false;
    document.getElementById('logFilterError')?.classList.toggle('active', logShowError);
    document.getElementById('logFilterWarn')?.classList.toggle('active', false);
    applyLogFilter();
}

function toggleWarnOnly() {
    logShowWarn = !logShowWarn;
    if (logShowWarn) logShowError = false;
    document.getElementById('logFilterWarn')?.classList.toggle('active', logShowWarn);
    document.getElementById('logFilterError')?.classList.toggle('active', false);
    applyLogFilter();
}
```

**Step 3: 修改 `appendOcLogLine()` 加入 buffer 寫入**

在原有推入 DOM 邏輯之前加入：

```js
const level = detectLineLevel(line);
logBuffer.push({ line, level });
if (logBuffer.length > LOG_BUFFER_MAX) logBuffer.shift();
if (!lineMatchesFilter(line)) return;
```

並把 DOM 推入那行改成用 `div.className = \`log-line ${level}\``

**Step 4: index.html — 在 log terminal 上方加入搜尋列**

```html
<div class="log-filter-bar">
    <input type="text" id="logSearch" placeholder="搜尋 log..." oninput="setLogFilter(this.value)" class="log-search-input">
    <button id="logFilterError" onclick="toggleErrorOnly()" class="log-filter-btn">ERROR</button>
    <button id="logFilterWarn" onclick="toggleWarnOnly()" class="log-filter-btn">WARN</button>
</div>
```

**Step 5: style.css 加入樣式**

```css
.log-filter-bar { display: flex; gap: 6px; align-items: center; padding: 6px 0; }
.log-search-input { flex: 1; background: var(--bg-input, var(--bg-card)); border: 1px solid var(--border); border-radius: 6px; padding: 5px 10px; color: var(--text-primary); font-size: 12px; }
.log-filter-btn { background: var(--bg-card); border: 1px solid var(--border); border-radius: 4px; padding: 4px 10px; font-size: 11px; cursor: pointer; color: var(--text-muted); transition: .15s; }
.log-filter-btn.active { border-color: var(--red); color: var(--red); background: var(--red-light, #fde8e8); }
.log-line.error { color: var(--red, #e74c3c); }
.log-line.warn  { color: var(--orange, #e67e22); }
mark { background: rgba(255, 200, 0, 0.35); color: inherit; border-radius: 2px; }
```

**Step 6: 驗證**

```bash
npm start
# Logs tab → 啟動 streaming → 輸入關鍵字 → 確認 highlight 正常
# ERROR toggle → 確認只顯示 error 行
```

**Step 7: Commit**

```bash
git add src/frontend/public/js/modules/logs.js src/frontend/public/index.html src/frontend/public/css/style.css
git commit -m "feat(p3): add log search filter with highlight and ERROR/WARN toggles"
```

---

### Task 14: Cost Trend 圖（4-B）

**Files:**
- Modify: `src/backend/services/tsdbService.js`
- Modify: `src/backend/controllers/legacyDashboardController.js`
- Modify: `src/frontend/public/js/modules/charts.js`
- Modify: `src/frontend/public/index.html`

**Step 1: tsdbService.js — 在 `getAgentTopTokens()` 之後加入**

```js
function getCostHistory(limit = 60) {
    const stmt = db.prepare(`
        SELECT strftime('%Y-%m-%dT%H:%M:00Z', timestamp) as ts,
               ROUND(SUM(cost), 6) as total_cost
        FROM agent_metrics
        GROUP BY strftime('%Y-%m-%dT%H:%M:00Z', timestamp)
        ORDER BY ts DESC
        LIMIT ?
    `);
    try {
        return stmt.all(limit).reverse();
    } catch (e) {
        return [];
    }
}
```

更新 module.exports 加入 `getCostHistory`。

**Step 2: legacyDashboardController.js — `getHistory()` 加入 costHistory**

```js
const costHistory = tsdbService.getCostHistory(60);
res.json({ success: true, history, topSpenders, costHistory });
```

**Step 3: charts.js — `fetchHistory()` 成功後處理 costHistory**

在 `fetchHistory()` 的成功處理加入：

```js
if (data.costHistory) { costHistoryData = data.costHistory; if (currentDesktopTab === 'system') updateCharts(); }
```

在 charts.js 頂部加入：`let costHistoryData = [];`

在 `updateCharts()` 末尾加入：

```js
if (document.getElementById('costSparkline') && costHistoryData.length > 1) {
    drawSparkline('costSparkline', costHistoryData.map(r => r.total_cost || 0), costHistoryData.map(r => (r.ts || '').slice(11, 16)));
}
```

**Step 4: index.html — System tab 加入 canvas**

```html
<div class="metric-card">
    <div class="metric-label">成本趨勢 (60m USD)</div>
    <canvas id="costSparkline" height="40"></canvas>
</div>
```

**Step 5: Commit**

```bash
git add src/backend/services/tsdbService.js src/backend/controllers/legacyDashboardController.js src/frontend/public/js/modules/charts.js src/frontend/public/index.html
git commit -m "feat(p3): add cost trend sparkline from TSDB agent_metrics"
```

---

### Task 15: Agent 活動摘要（4-C）

**Files:**
- Modify: `src/backend/services/tsdbService.js`
- Modify: `src/backend/controllers/legacyDashboardController.js`
- Modify: `src/frontend/public/js/app.js`
- Modify: `src/frontend/public/index.html`
- Modify: `src/frontend/public/css/style.css`

**Step 1: tsdbService.js — 新增 `getAgentActivitySummary()`**

```js
function getAgentActivitySummary() {
    const stmt = db.prepare(`
        SELECT agent_id,
               MAX(timestamp) as last_seen,
               SUM(CASE WHEN status LIKE '%active%' THEN 1 ELSE 0 END) as active_snapshots
        FROM agent_metrics
        WHERE timestamp >= datetime('now', '-24 hours')
        GROUP BY agent_id
    `);
    try {
        return stmt.all().map(r => ({
            agent_id: r.agent_id,
            active_minutes: r.active_snapshots,
            last_seen: r.last_seen,
        }));
    } catch (e) {
        return [];
    }
}
```

更新 module.exports。

**Step 2: legacyDashboardController.js — `getHistory()` 加入**

```js
const agentActivity = tsdbService.getAgentActivitySummary();
res.json({ success: true, history, topSpenders, costHistory, agentActivity });
```

**Step 3: app.js — 新增 `renderAgentActivityBanner()` 並在 fetchHistory 呼叫**

```js
function renderAgentActivityBanner(agentActivity) {
    const el = document.getElementById('agentActivityBanner');
    if (!el || !agentActivity?.length) return;
    const total = agentActivity.length;
    const active = agentActivity.filter(a => a.active_minutes > 0).length;
    const lastSeen = agentActivity.reduce((max, a) => (a.last_seen > max ? a.last_seen : max), '');
    el.textContent = `過去 24h：${total} 個 Agent，${active} 個曾活躍｜最後活動：${lastSeen ? lastSeen.slice(11, 16) : '-'}`;
}
```

在 `fetchHistory()` 成功回呼加入：`if (data.agentActivity) renderAgentActivityBanner(data.agentActivity);`

**Step 4: index.html — agents 列表頂部加入 banner**

```html
<div id="agentActivityBanner" class="agent-activity-banner"></div>
```

**Step 5: style.css 加入**

```css
.agent-activity-banner { font-size: 11px; color: var(--text-muted); padding: 4px 8px; background: var(--bg-card); border-radius: 4px; margin-bottom: 8px; }
```

**Step 6: Commit**

```bash
git add src/backend/services/tsdbService.js src/backend/controllers/legacyDashboardController.js src/frontend/public/js/app.js src/frontend/public/index.html src/frontend/public/css/style.css
git commit -m "feat(p3): add 24h agent activity summary banner"
```

---

## 完整 PR 計畫

| PR | Tasks | 標題 |
|----|-------|------|
| PR-1 | 1–4 | feat: P0 alert engine with threshold UI |
| PR-2 | 5–7 | perf: P1 dashboard performance optimizations |
| PR-3 | 8–12 | refactor: P2 modularize app.js into modules/ |
| PR-4 | 13–15 | feat: P3 log search, cost trend, agent activity |

## 回滾指引

每個 PR 均可獨立還原：

```bash
git revert <commit-hash-1> <commit-hash-2> ...
```

P2 回滾時需同時還原 index.html 的 script 標籤順序。
