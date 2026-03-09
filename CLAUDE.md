# Agent Monitor Web

OpenClaw Agent 監控後台，Node.js + Express 後端 + 純 HTML/CSS/JS 前端。

## 專案使命
- 角色：OpenClaw 自主 AI Agent 與運維後台的監控、警報處理、維護與持續優化助手
- 階段：優化期（Auto-Memory Learning）
- 目標：可靠、持續進化的監控與運維助手

### 學習重點（長期模式辨識）
- 監控節奏與警報決策流程
- 任務拆解與維護優先級
- 輸出結構（健康摘要、警報細節、資源圖表）
- 系統變更與監控規則調整前的確認需求
- 對異常行為、資源波動、安全事件與 downtime 的反應

### Auto-Memory 原則
- 只記錄長期模式，不記一次性操作
- 不確定是否該記憶時，先詢問使用者
- 記憶目的：降低監控摩擦，非增加誤報風險

### 工作方式
- 先給結論，再給理由
- 偏實務、可執行
- 監控規則變更前先說明影響、風險與回滾方式

## 啟動
- `npm start` → https://localhost:3001 (HTTPS，需 mkcert 憑證在 `./cert/`)
- `npm test` → jest --forceExit --detectOpenHandles
- **重啟服務**：`pkill -f "node server.js" && npm start &`
- **版本快取清除**：前端 JS `?v=YYYYMMDD`，改動後需更新日期並 Cmd+Shift+R

## 架構摘要
- `src/backend/` — Express 控制器、services、security
- `src/frontend/public/` — 純前端 (html/css/js，無框架)
- `tests/` — Jest 測試，與 src/backend/ 結構對應
- 詳細模組清單、API 路由、資料來源 → `docs/architecture.md`

## 開發流程
詳見 `.claude/rules/workflow.md`。commit 格式：`feat(sN): <description>`

## 關鍵注意事項
- 不把 cron job JSON dump 輸出到 log stream
- 所有後端 API 走 `src/backend/routes/api.js`
- 現行 controller：`dashboardReadController.js` / `controlController.js`
- request id / structured log 由 `requestContext.js` / `requestLogger.js` 接管
- 安全/合規模組在 `src/backend/security/`，修改前確認影響範圍
- CSS：`agent-group-header`/`agent-grid-inner`/`agent-group-details` 需 `grid-column: 1/-1`
- Session JSONL：每行 `{type, message: {role, content[]}}`，`type=message` 才是對話
- `openclawService` 無 `listAgents()`，用 `getOpenClawData('openclaw agents list')`
- 多 agent 協作時先看 `progress.md`，frontend 優先在 worktree 上工作再 cherry-pick
