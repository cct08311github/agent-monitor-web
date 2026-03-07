# Progress

Last updated: 2026-03-07T13:00 Asia/Taipei

## Collaboration Rules

- Main worktree: `/Users/openclaw/.openclaw/shared/projects/agent-monitor-web`
- Frontend worktree: `/Users/openclaw/.openclaw/shared/projects/agent-monitor-web-frontend`
- Commit format: `feat(s1): ...`
- When changing frontend JS, update `index.html` query strings (`?v=YYYYMMDD`).
- Both worktrees clean at last handoff.

## Sprint 1 Checklist

### Backend Refactor

- [x] Centralize backend config and startup validation (`daf2227`)
- [x] Split auth middleware and require control token (`e2a697d`)
- [x] Add shared openclaw client (`1a39c8d`)
- [x] Remove remaining backend path hardcoding (`62c323c`)
- [x] Extract dashboard read services (`a7485dd`)
- [x] Extract dashboard payload service (`7459ee0`)
- [x] Standardize api error responses (`d97e9a1`)
- [x] Unify management api responses (`9ddd0b7`)
- [x] Align controller api responses (`1044158`)
- [x] Add readiness and dependency health endpoints (`63af241`)
- [x] Replace legacy controller entrypoints (`40aa47c`)
- [x] Add request context logging (`2b6b157`)
- [x] Align controller test naming (`a31fab7`)
- [x] Add structured controller logging (`8db5918`)
- [x] Clean up watchdog config paths (`25b4575`)
- [x] Remove legacy controller wrappers (`ac7d45c`)
- [x] Add project agent instructions (`25d3fb1`)

### Frontend Modularization

- [x] Add frontend api client (`85a6e80`)
- [x] Route app data requests through api client (`e82586d`)
- [x] Move command interactions to api client (`3fc4b6c`)
- [x] Centralize frontend dashboard state (`34611f7`)
- [x] Add frontend stream manager (`0cdac1a`)
- [x] Split app command and error modules (`6e75fca`)
- [x] Split app navigation and detail modules (`9e36c20`)
- [x] Split app runtime modules (`87045b4`)
- [x] Split app bootstrap runtime (`4d2bc79`)
- [x] Split dashboard render modules (`d5c3889`)

### QA + Fixes

- [x] Fix optimizeService test mocks (Telegram mock → openclawClient) (`9cc4c98`)
- [x] Frontend global cleanup: remove redundant app.js globals, move loadErrorKeys to state.js (`22fc82f`)
- [x] Fix apiRoutes flaky dashboard test (mock dashboardPayloadService)
- [x] Add cache-busting `?v=` to theme-manager.js

### Backend Logger Normalization

- [x] dashboardPayloadService: 4 console.error → structured logger (`22fc82f`)
- [x] openclawService: 1 console.error → structured logger
- [x] tsdbService: 2 console.error → structured logger
- [x] modelMonitor: 1 console.error → structured logger
- [x] Security modules (4 files): runtime logs → structured logger
- [x] controlOriginPolicy: console.warn → structured logger
- [x] controlAudit: console.error → structured logger
- [x] agentWatcherService: console.log → structured logger
- [x] Backend has zero remaining runtime console.* (self-test blocks preserved)

### QA Verification

- [x] Full test suite: 32/32 suites, 421/421 tests
- [x] Frontend syntax: all 21 JS files pass `node -c`
- [x] Frontend module completeness: 21 files = 21 script tags
- [x] Script load order: state → stream → api → UI → app → runtime → bootstrap
- [x] Cross-module globals: apiClient/appState/streamManager correctly wired
- [x] Legacy cleanup: no legacy controller files or references
- [x] Backend route integrity: api.js imports 11 controllers, all exist
- [x] Server startup: starts normally, health endpoints respond
- [x] Watchdog smoke: 36/36 watchdog tests pass, no structural issues

### Research Completed

- [x] Frontend globals inventory (A2) — see below

## Frontend Globals Inventory

| Type | Count | Description |
|------|-------|-------------|
| state-alias | 16 | Managed by `state.js` via `Object.defineProperty` |
| shared-api | 40 | Cross-module utilities (esc, showToast, renderDashboard, etc.) |
| inline-handler | 39 | Referenced from `index.html` onclick/oninput handlers |
| accidental | ~~52~~ **0** | Eliminated by IIFE wrapping all 7 files |

**Status:** All 21 JS files now use IIFE wrappers. 52 accidental globals eliminated.
- `window.fetch` is monkey-patched in `auth-ui.js` for 401 intercept (intentional)

## Watchdog Smoke Findings (C2)

- All 36 tests pass (12 + 19 + 5)
- No blocking issues
- Optional improvements:
  1. `/watchdog/status` has no auth guard (read-only, low risk)
  2. `/watchdog/toggle` does not validate `req.body.enabled` type
  3. Escalation path (3 consecutive failures) has no test coverage
  4. Module-level `getOpenClawConfig()` call could crash on require if config broken

## Remaining Work Checklist

### Priority 1 — Frontend Polish (optional)

- [x] **A3.** Wrap non-IIFE modules in IIFEs to eliminate 52 accidental globals
  - Files: `app.js`, `theme-manager.js`, `modules/chat.js`, `modules/logs.js`, `modules/taskhub.js`, `modules/charts.js`, `modules/cron.js`
  - All 7 files wrapped, 46 symbols exposed via `window.X =`, 52 accidentals now private
  - Validation: `node -c` all 7 files ✅ + 32/32 suites 421/421 tests ✅
- [ ] **A4.** Optional dashboard-specific stream wrapper
  - Files: `stream-manager.js`, `dashboard-runtime.js`, `logs.js`, `optimize-runner.js`
  - Decision: does `dashboard-stream.js` add clarity?
  - Validation: `node -c` + manual SSE smoke

### Priority 2 — Health/Operability (on-demand)

- [ ] **C1.** Readiness dependency depth review
  - Files: `healthService.js`, `api.js`
  - Decision: should readiness check CLI/TaskHub/watchdog availability?
  - Validation: `npx jest tests/healthService.test.js tests/apiRoutes.test.js --testNamePattern="health|readiness"`
- [ ] **C3.** Watchdog optional hardening (from smoke findings)
  - Add `enabled` type validation to toggle endpoint
  - Add test for escalation path (3 consecutive repair failures)
  - Wrap module-level config in try/catch

### Priority 3 — Documentation (after code settles)

- [ ] **D1.** Historical docs decision
  - Files: `docs/plans/2026-03-02-*.md`
  - Recommendation: preserve as-is (archival, not runtime)
- [ ] **D2.** Architecture snapshot refresh
  - Files: `README.md`, `CLAUDE.md`
  - Do once after all code changes complete

## Notes For Other AI Workers

- If you touch frontend JS, keep syntax-valid and run `node -c` on changed files.
- If you touch backend routes/controllers, run the narrowest relevant Jest subset.
- Check `git status --short` before each commit — do not stage unrelated files.
- The primary roadmap is complete; remaining work is optional cleanup.
- Frontend IIFE wrapping (A3) is the highest-value remaining task.
