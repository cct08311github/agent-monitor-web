# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Stack

- **Backend**: Express 4.18 + better-sqlite3
- **Frontend**: Vanilla HTML/CSS/JS (no framework) + SSE for real-time
- **Testing**: Jest (460+ tests, 36 suites) + Playwright E2E

## Commands

```bash
npm start                        # HTTPS → https://localhost:3001 (requires mkcert certs in ./cert/)
npm run dev                      # nodemon auto-reload
npm test                         # jest --forceExit --detectOpenHandles
npx jest tests/auth.test.js      # run single test file
npx jest --testNamePattern="login"  # run tests matching name
npm run test:e2e                 # Playwright E2E (headless)
npm run test:e2e:headed          # Playwright E2E (see browser)
```

重啟服務：`pkill -f "node server.js" && npm start &`

前端 JS 使用 `?v=YYYYMMDD` cache busting，改動後需更新日期並 Cmd+Shift+R 強制刷新。

## Architecture

### Message Flow
```
Browser → HTTPS (3001) → Express → controllers → services → openclaw CLI / SQLite
                                    ↕ SSE (real-time updates)
```

### Backend Structure (`src/backend/`)
- **Routes**: 單一入口 `routes/api.js` — 所有 API 路由定義在此
- **Controllers** (11): dashboardRead, control, auth, alert, optimize, cron, taskHub, agent, security, compliance, system
- **Services** (12+): dashboardPayload, openclaw, session, health, optimize, alert, watchdog, tsdb, costCalculation, agentActivityDetector, sseStreamManager, pluginRegistry, etc.
- **Repositories**: `taskHubRepository.js` — SQLite (better-sqlite3) 資料存取
- **Utils**: `appError.js`（統一錯誤類）、`apiResponse.js`（`sendOk` 回應格式）、`logger.js`

### Auth — 三層機制

路由在 `routes/api.js` 中的 middleware 順序決定了 auth 層級：

1. **Public** — `/api/read/health`, `/api/auth/*` — 無 auth，login 有獨立 rate limit
2. **Control (Bearer)** — `/api/control/*` — `requireBearerToken` + `localhostOnlyControl` + audit，用 `HUD_CONTROL_TOKEN`
3. **Session (Cookie)** — `router.use(auth.requireAuth)` 之後的所有路由 — bcryptjs + HttpOnly cookies + HMAC session store
4. **寫入操作** — 額外加 `csrfVerifier` + `localhostOnlyControl` + `rateLimit`

### Frontend Structure (`src/frontend/public/`)

純 JS modules，無 bundler。關鍵載入順序：

- `js/base-path.js` — **必須第一個載入**，設定 `window.__BASE_PATH` 供所有 API 呼叫前綴
- `js/state.js` — 前端共享狀態 (`window.appState`)
- `js/api-client.js` — fetch wrapper，所有請求用 `__BASE_PATH` 前綴
- `js/stream-manager.js` — SSE EventSource 封裝（dashboard/logs/optimize 共用）
- `js/dashboard-render.js` — Focus + Periphery 佈局，active agents → `#agentFocus`，idle → `#agentPeriphery`
- `js/modules/` — charts, logs, chat, cron, taskhub

CSS 三層分離（改動時只動 theme.css 或 overhaul.css，不動 style.css）：
- `css/style.css` — 基礎 grid/flex 佈局（**不要動**）
- `css/theme.css` — 只放 CSS 變數（顏色、圓角、陰影）
- `css/overhaul.css` — 元件級視覺覆蓋

### Real-time (SSE)
- `/api/read/stream` — dashboard agent 狀態
- `/api/logs/stream` — live gateway logs（localhost only）
- `/api/optimize/run` — 自主優化進度

### Sub-path 掛載

`BASE_PATH` 環境變數控制 reverse proxy sub-path（如 Tailscale serve `/agent-monitor`）。
- Backend: `app.js` 用 `express.Router` 雙掛載（`/` 和 `BASE_PATH`）
- Frontend: `js/base-path.js` 從 URL 自動偵測，所有 fetch/SSE 呼叫前綴 `window.__BASE_PATH`

## Key Gotchas

- `openclawService` 無 `listAgents()`，用 `getOpenClawData('openclaw agents list')`
- Session JSONL 格式：每行 `{type, message: {role, content[]}}`，`type=message` 才是對話
- 不把 cron job JSON dump 輸出到 log stream（`api.js` 中有 suppress 邏輯）
- `#agentGrid` DOM 元素保留但 hidden，排版邏輯全在 Focus/Periphery
- 安全/合規模組在 `src/backend/security/`（adaptive security, threat intelligence, compliance），修改前確認影響範圍
- `sendOk(res, data)` 是統一回應格式，不要用 `res.json()` 直接回

## Testing

Jest suites mirror `src/backend/` 結構。`tests/setup.js` 全域設定 `AUTH_DISABLED=true`，auth 相關測試需在 describe 內自行覆蓋。

```bash
npx jest tests/auth.test.js           # 單一檔案
npx jest --testNamePattern="dashboard" # 名稱匹配
```

### E2E Tests (Playwright)
- `tests/e2e/api.spec.js` — API endpoint tests
- `tests/e2e/dashboard.spec.js` — UI tests (login, navigation, responsive, a11y)
- E2E 從 Jest 排除（`testPathIgnorePatterns`），需單獨執行 `npm run test:e2e`
- 需設定 `E2E_USERNAME` / `E2E_PASSWORD` 環境變數

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `PORT` | HTTPS port (default 3001) |
| `OPENCLAW_ROOT` | OpenClaw 安裝目錄 |
| `HUD_CONTROL_TOKEN` | Control endpoint bearer token |
| `GEMINI_API_KEY` | 自主優化 pipeline |
| `AUTH_DISABLED` | 停用登入（測試用）|
| `BASE_PATH` | Tailscale serve sub-path 前綴（如 `/agent-monitor`）|
| `E2E_USERNAME` / `E2E_PASSWORD` | E2E 測試認證 |
| `BASE_URL` | E2E 測試目標 URL（預設 https://localhost:3001）|
