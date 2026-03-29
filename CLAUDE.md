# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Stack

- **Backend**: Express 4.18 + better-sqlite3
- **Frontend**: Vanilla HTML/CSS/JS (no framework) + SSE for real-time
- **Testing**: Jest (460+ tests, 36 suites) + Playwright E2E

## Commands

```bash
npm start     # HTTPS → https://localhost:3001 (requires mkcert certs in ./cert/)
npm run dev   # nodemon auto-reload
npm test      # jest --forceExit --detectOpenHandles
npm run test:e2e        # Playwright E2E tests (headless)
npm run test:e2e:ui     # Playwright E2E with UI
npm run test:e2e:headed # Playwright E2E headed (see browser)
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
- **11 controllers** — dashboard, control, auth, alert, optimize, cron, taskHub, agent, security, compliance, system
- **12 services** — dashboardPayload, openclaw, session, health, optimize, alert, watchdog, tsdb, costCalculation, agentActivityDetector, etc.
- **所有 API 路由** — `src/backend/routes/api.js`（統一大總口）
- **Middleware**: session/control auth, rate limit, audit, error handler, request context/logger

### Frontend Structure (`src/frontend/public/js/`)
- 純 JS modules，無 bundler
- `state.js` — 前端共享狀態 (`window.appState`)
- `stream-manager.js` — SSE EventSource 封裝（dashboard/logs/optimize 共用）
- `api-client.js` — fetch/JSON error handling
- `modules/` — charts.js, logs.js, chat.js, cron.js, taskhub.js

### Auth System
- bcryptjs + HttpOnly cookies + HMAC session store
- Rate limiting on all public endpoints
- Bearer token for control endpoints (`HUD_CONTROL_TOKEN`)

### Real-time (SSE)
- `/api/read/stream` — dashboard agent 狀態
- `/api/logs/stream` — live gateway logs
- `/api/optimize/run` — 自主優化進度

## Key Gotchas

- `openclawService` 無 `listAgents()`，用 `getOpenClawData('openclaw agents list')`
- Session JSONL 格式：每行 `{type, message: {role, content[]}}`，`type=message` 才是對話
- 不把 cron job JSON dump 輸出到 log stream
- CSS `grid-column: 1/-1` 用於 `agent-group-header`/`agent-grid-inner`/`agent-group-details`
- 安全/合規模組在 `src/backend/security/`，修改前確認影響範圍

## Testing

Jest suites mirror `src/backend/` 結構。Commit format: `feat(sN): <description>` (N = sprint 編號)。

### E2E Tests (Playwright)
- `tests/e2e/api.spec.js` — API endpoint tests (auth, agents, sessions, cron, alerts, etc.)
- `tests/e2e/dashboard.spec.js` — UI tests (login, dashboard, navigation, responsive, a11y)
- E2E tests excluded from Jest (`testPathIgnorePatterns`)，需單獨執行 `npm run test:e2e`
- 需要設定 `E2E_USERNAME` / `E2E_PASSWORD` 環境變數才能執行

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `PORT` | HTTPS port (default 3001) |
| `OPENCLAW_ROOT` | OpenClaw 安裝目錄 |
| `HUD_CONTROL_TOKEN` | Control endpoint bearer token |
| `GEMINI_API_KEY` | 自主優化 pipeline |
| `AUTH_DISABLED` | 停用登入（測試用）|
| `E2E_USERNAME` | E2E 測試登入用戶名 |
| `E2E_PASSWORD` | E2E 測試登入密碼 |
| `BASE_URL` | E2E 測試目標 URL（預設 https://localhost:3001）|
