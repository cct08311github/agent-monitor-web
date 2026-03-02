# System Optimization Design
**Date**: 2026-03-02
**Strategy**: 漸進式優化（Incremental Improvement）
**Status**: Approved

---

## 背景

Agent Monitor Web 現況：
- `legacyDashboardController.js` 611 行，承擔資料收集、快取、SSE 廣播
- `app.js` 1628 行，所有前端功能混在一起
- 無主動警報機制——Agent 異常時無感知
- 多個 `execFile('openclaw', ...)` 可能並發，無 in-flight 去重

---

## 優化範圍

| 優先 | 項目 | 分類 |
|------|------|------|
| P0 | 警報系統 + 閾值 UI | 可觀測性 |
| P1 | 效能優化（in-flight 去重、debounce、版本 cache） | 效能 |
| P2 | app.js 拆解成模組 | 可維護性 |
| P3 | Log 搜尋過濾 | 功能 |
| P3 | Cost Trend 圖 | 功能 |
| P3 | Agent 活動摘要 | 功能 |

---

## P0 — 警報系統

### 架構

```
legacyDashboardController (每 15s poller)
        │
        ▼
  AlertEngine.evaluate(payload)
        │
  閾值觸發 → alertsBuffer[] (最近 50 筆，記憶體)
        │
        ▼
  SSE stream 推播 (event: alert)
        │
        ▼
  前端 toast 通知 + alert badge
```

### 預設閾值

| 指標 | 閾值 | 嚴重度 |
|------|------|--------|
| CPU | > 80% | warning |
| CPU | > 95% | critical |
| Memory | > 85% | warning |
| Active agents | 0（且前次 > 0） | critical |
| Agent 從 active → inactive | 突然消失 | info |

### 閾值 UI
- **儲存**：`data/alert-config.json`
- **API**：
  - `GET /api/alerts/config` — 讀取目前設定
  - `PATCH /api/alerts/config` — 更新閾值（localhostOnly + rateLimit）
  - `GET /api/alerts/recent` — 最近 50 筆警報記錄
- **前端**：Dashboard 加「警報設定」按鈕，展開 modal，input number + enable/disable toggle
- **UI 風格**：與現有 TaskHub modal 一致

### 設計決策
- 警報不寫 DB，只存記憶體 buffer（重啟清空）
- 同一規則 5 分鐘 cooldown，防止重複推播
- 閾值設定持久化至 `data/alert-config.json`

### 新增檔案
- `src/backend/services/alertEngine.js`
- `src/backend/controllers/alertController.js`

### 修改檔案
- `src/backend/routes/api.js` — 掛載 alert routes
- `src/backend/controllers/legacyDashboardController.js` — poller 呼叫 `AlertEngine.evaluate()`
- `src/frontend/public/js/app.js` — 處理 `event: alert` SSE、toast、badge、設定 modal

---

## P1 — 效能優化

### 三個獨立改動

**① In-flight 請求去重**
`updateSharedData()` 加 `pendingFetch` promise，同時多個觸發只發出一次 fetch：
```js
if (pendingFetch) return pendingFetch;
pendingFetch = doFetch().finally(() => pendingFetch = null);
return pendingFetch;
```

**② File watcher debounce**
`agentWatcherService` 已有 `stabilityThreshold: 500ms`，但 dashboard 端無 debounce。
在 dashboard controller 的 watcher 事件 handler 加 300ms debounce，防止大量 session 寫入時連發更新。

**③ 版本靜態 cache**
`openclaw --version` 目前可能在每次 dashboard 刷新重跑。改為 process 生命週期 cache（啟動時取一次，之後直接回傳）。

### 修改檔案
- `src/backend/controllers/legacyDashboardController.js`
- `src/backend/services/agentWatcherService.js`（可選）

---

## P2 — app.js 拆解

### 新增模組

| 檔案 | 內容 | 約行數 |
|------|------|--------|
| `js/modules/taskhub.js` | TaskHub 所有函式 | ~365 行 |
| `js/modules/chat.js` | Chat page + modal + model switch | ~390 行 |
| `js/modules/cron.js` | Cron jobs 相關 | ~130 行 |
| `js/modules/charts.js` | Sparkline + history fetch | ~90 行 |
| `js/modules/logs.js` | OC log streaming | ~90 行 |

拆完後 `app.js` 剩約 **560 行**。

### index.html 載入順序
```html
<script src="js/modules/logs.js"></script>
<script src="js/modules/charts.js"></script>
<script src="js/modules/cron.js"></script>
<script src="js/modules/chat.js"></script>
<script src="js/modules/taskhub.js"></script>
<script src="js/app.js"></script>
```

### 約束
- 不引入 ES modules / bundler
- 不改函式簽名，零 regression 風險
- 全部維持全域函式

---

## P3 — 功能補完

### 4-A. Log 搜尋過濾
- Log buffer 保留最近 500 行（前端記憶體）
- 搜尋欄：關鍵字即時 highlight + 捲到第一筆
- 快速篩選：「只顯示 ERROR」「只顯示 WARN」toggle 按鈕
- 純前端，不改後端

**修改**：`app.js` / `modules/logs.js` 的 `appendOcLogLine()`

### 4-B. Cost Trend 圖
- System tab 新增 cost 折線（過去 60 分鐘總花費 USD）
- 後端 `tsdbService.js` 新增 `getCostHistory(limit)`
- `legacyDashboardController.js` 的 `getHistory()` 回傳加入 `costHistory`
- 前端 `charts.js` 新增 cost sparkline

**修改**：`tsdbService.js`, `legacyDashboardController.js`, `charts.js`

### 4-C. Agent 活動摘要
- Monitor tab agents 列表頂部加一行統計：今日 active 時數 + 最後 active 時間
- `tsdbService.js` 新增 `getAgentActivitySummary()`
- `legacyDashboardController.js` 的 `getHistory()` 加入此資料
- `app.js` `renderDashboard()` 顯示摘要

**修改**：`tsdbService.js`, `legacyDashboardController.js`, `app.js`

---

## 實作順序

```
P0: 警報系統
  └── alertEngine.js
  └── alertController.js
  └── api.js (routes)
  └── legacyDashboardController.js (hook)
  └── app.js (SSE handler + UI)

P1: 效能優化
  └── legacyDashboardController.js (in-flight dedup + version cache)
  └── agentWatcherService.js (debounce, optional)

P2: app.js 拆解
  └── modules/logs.js
  └── modules/charts.js
  └── modules/cron.js
  └── modules/chat.js
  └── modules/taskhub.js
  └── app.js (移除拆出的函式)
  └── index.html (新增 script 標籤)

P3: 功能補完
  └── 4-A: Log 搜尋 (logs.js)
  └── 4-B: Cost Trend (tsdbService + dashboard + charts.js)
  └── 4-C: Agent 活動摘要 (tsdbService + dashboard + app.js)
```

---

## 回滾策略

每個 P 獨立為一個 PR，任一 PR 均可獨立回滾：
- P0 回滾：移除 alertEngine hook + alert routes，前端移除 alert handler
- P1 回滾：還原 `legacyDashboardController.js` 相關函式
- P2 回滾：還原 index.html script 標籤，保留 app.js 原始版本
- P3 回滾：各功能獨立，可單獨還原
