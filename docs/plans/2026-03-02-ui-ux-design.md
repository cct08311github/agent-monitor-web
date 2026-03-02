# UI/UX Optimization Design (Strategy B)
**Date**: 2026-03-02
**Strategy**: 佈局重整（Layout Refactor）
**Status**: Approved

---

## 背景

現有 UI 在功能陸續增加後出現以下問題：
- Header 右側元素擁擠（6 個元素、兩個重複 alert badge）
- Summary cards 不分脈絡永遠顯示，在 Chat/Logs tab 佔用無用空間
- Agent grid active/inactive 混排，掃視困難
- TaskHub table 無排序、domain 欄冗餘、操作欄擁擠
- Modal 樣式不一致、log filter 無明確 active 狀態

---

## Section 1 — Header 精簡

### 問題
- `header-right` 有 6 個元素，兩個 alert badge（`p0AlertBadge`、`alertBadge`）重疊
- 「即時更新」文字常駐，不傳達資料新鮮度

### 方案
```
[left: 🐾 logo + title]  [center: tabs]  [right: 🔔(n) | 🌓 | 🔄⬤]
```

- 合併兩個 badge 為單一 `🔔` 按鈕，右上角紅點顯示未讀數，點擊開警報設定/記錄
- 移除「即時更新」文字，改為 🔄 按鈕旁一個 `⬤` 連線狀態圓點
  - 綠色：連線中
  - 灰色：離線（斷線超過 60s）
  - hover tooltip：「最後更新：Xs 前」（每秒倒數）
- header-right 最終 3 個元素：`[🔔] [🌓] [🔄⬤]`

### 修改檔案
- `index.html` — header-right 結構調整
- `app.js` — 合併 badge 邏輯、新增連線狀態計時器
- `style.css` — header-right 樣式精簡

---

## Section 2 — Summary Cards Context-Aware

### 問題
- 4 張 summary cards 在所有 tab 固定顯示
- Chat tab 完全不需要 Agent/Cost 指標

### 方案
每個 tab 顯示對應 summary 組合：

| Tab | Card 1 | Card 2 | Card 3 | Card 4 |
|-----|--------|--------|--------|--------|
| 🖥️ 監控 | 總 Agents | 執行中 | Sub-Agents | 費用 |
| 📊 系統/費用 | CPU % | 記憶體 % | 磁碟 % | 費用 |
| ⚙️ 日誌 | OpenClaw 版本 | Watchdog 狀態 | 費用 | 最後指令 |
| 💬 聊天室 | （整個 section 隱藏） | | | |

### 實作
- `switchDesktopTab(tab)` 呼叫 `updateSummaryCards(tab)`
- 4 個 card slot 的 HTML 結構不變，JS 動態填入 label + value
- Chat tab：`summarySection.style.display = 'none'`

### 修改檔案
- `app.js` — `switchDesktopTab()` + `updateSummaryCards()`
- `style.css` — 無需改動

---

## Section 3 — Monitor Tab 改善

### 問題
- Active / inactive agent 混排
- Activity banner 獨佔一行
- Sub-Agents 標籤略長

### 方案

**① 子標籤精簡**
- `🔗 Sub-Agents` → `🔗 Sub`

**② Agent 分組**
```
● 執行中 (3)
[card][card][card]

▶ 閒置 (2)   ← <details> 預設收合
[card][card]
```
- active：`status !== 'inactive' && status !== 'idle'`
- inactive group 用 `<details><summary>` 包裹，預設 closed

**③ Activity banner 移入 card footer**
- 移除獨立 `#agentActivityBanner` div
- 各 agent card 底部新增一行小字：`今日 Xh active ／ 最後 HH:MM`
- 資料來源不變（`agentActivity` from `getHistory()`）

### 修改檔案
- `app.js` — `renderDashboard()` 中 agent grid 渲染邏輯
- `style.css` — agent group header、details/summary 樣式
- `index.html` — 移除 `#agentActivityBanner`、Sub-Agents tab label

---

## Section 4 — TaskHub Table 改善

### 問題
- 欄頭無排序
- 選 domain filter 後 Domain 欄是冗餘資訊
- 操作欄多按鈕時視覺擁擠

### 方案

**① 欄頭排序（純前端）**
- 可排序欄：優先（urgent>high>medium>low）、到期日、狀態
- 點欄頭 → asc；再點 → desc；點其他欄 → 換欄 asc
- 欄頭顯示方向符號：`優先 ↓`
- 對 `thTasks` 陣列 sort 後呼叫 `renderTasks()`

**② Domain 欄智慧顯示**
- `thDomain !== 'all'` 時，table 加 class `th-hide-domain` → CSS 隱藏 domain 欄
- title 欄 `min-width` 自動擴展

**③ 操作欄收納**
- 欄寬從 160px 縮至 80px
- 只顯示主要 action（開始 / 完成 / 恢復）
- 其他 action（封鎖、編輯）收進 `⋯` 按鈕下拉 menu
- `<div class="th-dropdown">` 實作，click toggle，點外部關閉

### 修改檔案
- `js/modules/taskhub.js` — `renderTasks()`、新增 sort 狀態、`_appendActionButtons()`
- `css/taskhub.css` — sort 箭頭、dropdown、`.th-hide-domain`

---

## Section 5 — 視覺一致性

### 問題
- Modal 兩種樣式（`.modal-content` vs `.modal-box`）
- Log filter 按鈕無明確 active 狀態
- Tab 命名「操作/日誌」混淆兩概念

### 方案

**① Modal 統一**
- `alertConfigModal` 內層改用 `.modal-content`，移除 `.modal-box`
- 所有 modal 共用 header / body / footer 結構

**② Log filter active 樣式**
```css
.log-filter-btn.active-error { background: rgba(239,68,68,.2); color: #ef4444; border-color: #ef4444; }
.log-filter-btn.active-warn  { background: rgba(245,158,11,.2); color: #f59e0b; border-color: #f59e0b; }
```
JS 中 `toggleErrorOnly()` / `toggleWarnOnly()` 切換對應 class。

**③ Tab 命名**
- `⚙️ 操作/日誌` → `⚙️ 日誌`（desktop tab + mobile nav 同步）

### 修改檔案
- `index.html` — alertConfigModal 結構、tab label
- `style.css` / `app.js` — log filter active class
- `js/modules/logs.js` — `toggleErrorOnly()` / `toggleWarnOnly()` 加 class 切換

---

## 實作順序

```
S1: Header 精簡
  └── index.html (header-right 結構)
  └── app.js (badge 合併、連線狀態計時器)
  └── style.css (header 樣式)

S2: Summary Cards Context-Aware
  └── app.js (switchDesktopTab + updateSummaryCards)

S3: Monitor Tab 改善
  └── app.js (agent 分組渲染、activity 移入 card)
  └── style.css (group header、details)
  └── index.html (banner 移除、sub-tab label)

S4: TaskHub Table 改善
  └── js/modules/taskhub.js (排序、domain 隱藏、dropdown)
  └── css/taskhub.css (sort arrow、dropdown、th-hide-domain)

S5: 視覺一致性
  └── index.html (modal 結構、tab label)
  └── style.css (log filter active)
  └── js/modules/logs.js (toggleErrorOnly/Warn class)
```

---

## 回滾策略

每個 Section 獨立 PR，任一 PR 均可回滾，互不影響。
