# Agent Monitor Web

OpenClaw Agent 監控後台，Node.js + Express 後端 + 純 HTML/CSS/JS 前端。

## 啟動
- `npm start` → https://localhost:3001 (HTTPS，需 mkcert 憑證在 `./cert/`)
- `npm test` → jest --forceExit --detectOpenHandles
- **重啟服務**：`pkill -f "node server.js" && npm start &`
- **版本快取清除**：前端 JS `?v=YYYYMMDD`，改動後需更新日期並 Cmd+Shift+R

## 架構
- `src/backend/` — Express 控制器、services、security 模組
- `src/frontend/public/` — 純前端 (html/css/js，無框架)
- `src/frontend/public/js/state.js` — 前端共享狀態容器 (`window.appState`)
- `src/frontend/public/js/stream-manager.js` — 共用 SSE/EventSource 管理
- `src/frontend/public/js/api-client.js` — 共用 API client
- `src/frontend/public/js/navigation.js` — tab / summary card 切換
- `src/frontend/public/js/detail-view.js` — agent detail / session modal
- `src/frontend/public/js/error-center.js` — dashboard error 與 SRE 流程
- `src/frontend/public/js/command-actions.js` — 控制命令與 output modal
- `src/frontend/public/js/watchdog-ui.js` — watchdog UI / manual repair / toggle
- `src/frontend/public/js/auth-ui.js` — 401 redirect / logout / auth bootstrap
- `src/frontend/public/js/optimize-runner.js` — optimize SSE progress UI
- `src/frontend/public/js/dashboard-runtime.js` — dashboard SSE 與連線狀態
- `src/frontend/public/js/bootstrap.js` — DOMContentLoaded 啟動流程
- `src/frontend/public/js/alert-config.js` — alert config modal / alert detection
- `src/frontend/public/js/dashboard-render.js` — dashboard agent/subagent render
- `src/frontend/public/js/modules/` — charts.js、logs.js、cron.js、chat.js、taskhub.js
- `tests/` — Jest 測試，與 src/backend/ 結構對應
- `progress.md` — 重構進度、工作樹分工、下一批 task slices

## 開發流程
1. open GitHub issue
2. fix → push
3. 等 CI 通過
4. close issue
commit 格式：`feat(sN): <description>`（N = sprint 編號）

## API 路由（`src/backend/routes/api.js`）
- `GET /api/read/dashboard` — 完整 dashboard payload（SSE via `/api/read/stream`）
- `GET /api/read/history` — 系統歷史 + costHistory + topSpenders
- `GET /api/read/liveness` / `/read/readiness` / `/read/dependencies` — 健康檢查
- `GET /api/agents/:agentId/sessions` — 該 agent 最新 20 個 sessions 列表
- `GET /api/agents/:agentId/sessions/:sessionId` — session 訊息內容（解析 JSONL）
- `GET /api/alerts/config` / `PATCH` — 告警設定
- `GET /api/taskhub/tasks` / `POST` / `PATCH` / `DELETE` — TaskHub 任務 CRUD
- `POST /api/command` — 執行 openclaw 指令（localhost only）
- `GET /api/optimize/run` — 自主優化 pipeline（SSE 串流，localhost only）

## 前端模組
| 檔案 | 職責 |
|------|------|
| `state.js` | 集中 dashboard/ui 前端狀態 |
| `stream-manager.js` | 共用 SSE 建立/重連封裝 |
| `api-client.js` | 共用 fetch/JSON/error handling |
| `navigation.js` | Desktop/Mobile tab 與 summary card 切換 |
| `detail-view.js` | Agent 詳情與 session modal |
| `error-center.js` | error banner、SRE 通知、follow-up modal |
| `command-actions.js` | `runCmd()` / output modal |
| `watchdog-ui.js` | watchdog 狀態呈現與控制 |
| `auth-ui.js` | auth 檢查、logout、401 redirect |
| `optimize-runner.js` | 自主優化進度串流 |
| `dashboard-runtime.js` | dashboard SSE 與 conn dot |
| `bootstrap.js` | 頁面初始化與事件綁定 |
| `alert-config.js` | 告警設定與 dashboard error detection |
| `dashboard-render.js` | Agent/Sub-Agent render 與統計更新 |
| `app.js` | 主邏輯：shared utility 與 update glue（逐步拆分中） |
| `charts.js` | drawSparkline、drawBarChart、drawHBarChart、fetchHistory、updateCostDisplay |
| `logs.js` | SSE log 串流 |
| `chat.js` | Agent 對話 |
| `cron.js` | Cron job 列表 |
| `taskhub.js` | TaskHub 任務管理 |

## 資料來源 (後端)
- `openclaw agents list` / `sessions list` / `cron status`
- SSE 串流：`/api/read/stream`
- tsdbService：系統歷史、agent token 排行、成本歷史

## 自主優化 Pipeline（`src/backend/services/optimizeService.js`）
- 觸發：System tab「🔍 執行自主優化」按鈕 → `GET /api/optimize/run`（SSE）
- 流程：collectData → Gemini 起草 → Gemini 審查 → Gemini Code Review → Gemini 整合 → 儲存 `docs/plans/` → Telegram 推播
- 模型：`gemini-3.1-pro-preview`（全步驟）
- API Key：讀 `process.env.GEMINI_API_KEY`，fallback 自動讀 `~/.openclaw/.env`
- 報告格式：`docs/plans/YYYY-MM-DD-auto-optimize.md`

## 注意事項
- 不把 cron job JSON dump 輸出到 log stream
- 所有後端 API 走 `src/backend/routes/api.js`
- 新 controller 名稱已是 `dashboardReadController.js` / `controlController.js`；`legacy*.js` 僅供相容與舊測試使用
- request id 與 API request/error structured log 已由 `requestContext.js` / `requestLogger.js` 接管
- 安全/合規模組在 `src/backend/security/`，修改前確認影響範圍
- `agent-group-header`、`agent-grid-inner`、`agent-group-details` 需要 `grid-column: 1/-1` 才能在 agent-grid 內橫跨整行
- Session JSONL 格式：每行 `{type, message: {role, content[]}}` ，type=message 才是對話
- `openclawService` 無 `listAgents()`，用 `getOpenClawData('openclaw agents list')`
- 需要多 agent 協作時，先看 `progress.md`，frontend 優先在額外 worktree 上工作再 cherry-pick 回主線
