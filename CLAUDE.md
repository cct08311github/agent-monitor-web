# Agent Monitor Web

OpenClaw Agent 監控後台，Node.js + Express 後端 + 純 HTML/CSS/JS 前端。

## 啟動
- `npm start` → http://localhost:3000 (server.js 為入口)
- `npm test` → jest --forceExit --detectOpenHandles

## 架構
- `src/backend/` — Express 控制器、services、security 模組
- `src/frontend/public/` — 純前端 (html/css/js，無框架)
- `tests/` — Jest 測試，與 src/backend/ 結構對應

## 開發流程
1. open GitHub issue
2. fix → push
3. 等 CI 通過
4. close issue
commit 格式：`feat(sN): <description>`（N = sprint 編號）

## 資料來源 (後端)
- `openclaw agents list` / `sessions list` / `cron status`
- SSE 串流：`/api/logs/stream`

## 注意事項
- 不把 cron job JSON dump 輸出到 log stream
- 所有後端 API 走 `src/backend/routes/api.js`
- 安全/合規模組在 `src/backend/security/`，修改前確認影響範圍
