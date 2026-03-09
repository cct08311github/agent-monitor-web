# Architecture Reference

## 目錄結構
- `src/backend/` — Express 控制器、services、security 模組
- `src/frontend/public/` — 純前端 (html/css/js，無框架)
- `src/frontend/public/js/modules/` — charts.js、logs.js、cron.js、chat.js、taskhub.js
- `tests/` — Jest 測試，與 src/backend/ 結構對應

## 前端模組
| 檔案 | 職責 |
|------|------|
| `state.js` | 集中 dashboard/ui 前端狀態 (`window.appState`) |
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
| `app.js` | 主邏輯：shared utility 與 update glue |

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

## 資料來源 (後端)
- `openclaw agents list` / `sessions list` / `cron status`
- SSE 串流：`/api/read/stream`
- tsdbService：系統歷史、agent token 排行、成本歷史

## 自主優化 Pipeline（`src/backend/services/optimizeService.js`）
- 觸發：System tab → `GET /api/optimize/run`（SSE）
- 流程：collectData → Gemini 起草 → 審查 → Code Review → 整合 → `docs/plans/` → Telegram
- 模型：`gemini-3.1-pro-preview`
- API Key：`process.env.GEMINI_API_KEY`，fallback `~/.openclaw/.env`
