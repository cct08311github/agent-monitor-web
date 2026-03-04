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
- `src/frontend/public/js/modules/` — charts.js、logs.js、cron.js、chat.js、taskhub.js
- `tests/` — Jest 測試，與 src/backend/ 結構對應

## 開發流程
1. open GitHub issue
2. fix → push
3. 等 CI 通過
4. close issue
commit 格式：`feat(sN): <description>`（N = sprint 編號）

## API 路由（`src/backend/routes/api.js`）
- `GET /api/read/dashboard` — 完整 dashboard payload（SSE via `/api/read/stream`）
- `GET /api/read/history` — 系統歷史 + costHistory + topSpenders
- `GET /api/agents/:agentId/sessions` — 該 agent 最新 20 個 sessions 列表
- `GET /api/agents/:agentId/sessions/:sessionId` — session 訊息內容（解析 JSONL）
- `GET /api/alerts/config` / `PATCH` — 告警設定
- `GET /api/taskhub/tasks` / `POST` / `PATCH` / `DELETE` — TaskHub 任務 CRUD
- `POST /api/command` — 執行 openclaw 指令（localhost only）

## 前端模組
| 檔案 | 職責 |
|------|------|
| `app.js` | 主邏輯：renderDashboard、showAgentDetail、openSessionView、agentSearch |
| `charts.js` | drawSparkline、drawBarChart、drawHBarChart、fetchHistory、updateCostDisplay |
| `logs.js` | SSE log 串流 |
| `chat.js` | Agent 對話 |
| `cron.js` | Cron job 列表 |
| `taskhub.js` | TaskHub 任務管理 |

## 資料來源 (後端)
- `openclaw agents list` / `sessions list` / `cron status`
- SSE 串流：`/api/read/stream`
- tsdbService：系統歷史、agent token 排行、成本歷史

## 注意事項
- 不把 cron job JSON dump 輸出到 log stream
- 所有後端 API 走 `src/backend/routes/api.js`
- 安全/合規模組在 `src/backend/security/`，修改前確認影響範圍
- `agent-group-header`、`agent-grid-inner`、`agent-group-details` 需要 `grid-column: 1/-1` 才能在 agent-grid 內橫跨整行
- Session JSONL 格式：每行 `{type, message: {role, content[]}}` ，type=message 才是對話
