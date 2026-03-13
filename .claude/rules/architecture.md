# agent-monitor-web Architecture Rules

## Stack

- Backend: Express 4.18 + better-sqlite3
- Frontend: vanilla HTML/CSS/JS (no framework) + SSE for real-time
- Testing: Jest (440+ tests, 35 suites)

## 目錄結構

- `src/backend/` — Express 控制器、services、security
- `src/frontend/public/` — 純前端 (html/css/js，無框架)
- `tests/` — Jest 測試，與 src/backend/ 結構對應
- 詳細模組清單、API 路由、資料來源 → `docs/architecture.md`

## Backend Conventions

- Controllers in `src/backend/` — 11 controllers, 12 services
- Auth: bcryptjs + HttpOnly cookies + HMAC sessions
- Rate limiting middleware on all public endpoints
- SSE for live log streaming and agent status updates

## Frontend Conventions

- Pure JS modules — no build step, no bundler
- Charts, logs, chat, cron, taskHub as separate JS modules
- Keep it simple — resist adding frameworks

## Security

- HTTPS via mkcert certs (localhost + Tailscale)
- Never expose internal OpenClaw paths in API responses
- Telegram notifications for security events
- Watchdog auto-repair: log actions, don't silently fix

## Testing

- Jest suites mirror backend structure
- Commit format: `feat(sN): <description>`
- All tests must pass before PR
