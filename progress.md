# Progress

Last updated: 2026-03-07T15:30 Asia/Taipei

## Collaboration Rules

- Main worktree: `/Users/openclaw/.openclaw/shared/projects/agent-monitor-web`
- Frontend worktree: `/Users/openclaw/.openclaw/shared/projects/agent-monitor-web-frontend`
- Commit format: `feat(s1): ...`
- When changing frontend JS, update `index.html` query strings (`?v=YYYYMMDD`).
- Both worktrees clean at last handoff.

## Sprint 1 — Completed

All Sprint 1 items are done. Collapsed for reference.

<details>
<summary>Backend Refactor (17 items)</summary>

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

</details>

<details>
<summary>Frontend Modularization (10 items)</summary>

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

</details>

<details>
<summary>QA + Fixes (4 items)</summary>

- [x] Fix optimizeService test mocks (Telegram mock -> openclawClient) (`9cc4c98`)
- [x] Frontend global cleanup: remove redundant app.js globals, move loadErrorKeys to state.js (`22fc82f`)
- [x] Fix apiRoutes flaky dashboard test (mock dashboardPayloadService)
- [x] Add cache-busting `?v=` to theme-manager.js

</details>

<details>
<summary>Backend Logger Normalization (9 items)</summary>

- [x] dashboardPayloadService: 4 console.error -> structured logger (`22fc82f`)
- [x] openclawService: 1 console.error -> structured logger
- [x] tsdbService: 2 console.error -> structured logger
- [x] modelMonitor: 1 console.error -> structured logger
- [x] Security modules (4 files): runtime logs -> structured logger
- [x] controlOriginPolicy: console.warn -> structured logger
- [x] controlAudit: console.error -> structured logger
- [x] agentWatcherService: console.log -> structured logger
- [x] Backend has zero remaining runtime console.* (self-test blocks preserved)

</details>

<details>
<summary>Frontend IIFE Wrapping (1 item)</summary>

- [x] **A3.** Wrap non-IIFE modules in IIFEs to eliminate 52 accidental globals (`ce91ecf`)
  - Files: `app.js`, `theme-manager.js`, `modules/chat.js`, `modules/logs.js`, `modules/taskhub.js`, `modules/charts.js`, `modules/cron.js`
  - 46 symbols exposed via `window.X =`, 52 accidentals now private

</details>

<details>
<summary>QA Verification (8 items)</summary>

- [x] Full test suite: 32/32 suites, 421/421 tests
- [x] Frontend syntax: all 21 JS files pass `node -c`
- [x] Frontend module completeness: 21 files = 21 script tags
- [x] Script load order: state -> stream -> api -> UI -> app -> runtime -> bootstrap
- [x] Cross-module globals: apiClient/appState/streamManager correctly wired
- [x] Legacy cleanup: no legacy controller files or references
- [x] Backend route integrity: api.js imports 11 controllers, all exist
- [x] Server startup: starts normally, health endpoints respond

</details>

## Next Steps — Optional Improvements

All remaining items are optional. Pick any item and mark `[x]` when done.

### Priority 1 — Frontend Polish

- [ ] **A4.** Dashboard-specific stream wrapper
  - Goal: extract SSE connection logic shared by dashboard/logs/optimize into a thin wrapper
  - Files to review: `stream-manager.js`, `dashboard-runtime.js`, `modules/logs.js`, `optimize-runner.js`
  - Decision needed: does a `dashboard-stream.js` add clarity, or is current code clear enough?
  - Steps:
    - [ ] A4.1 Audit current SSE usage across the 4 files, list shared patterns
    - [ ] A4.2 Decide: extract wrapper vs. keep as-is (document rationale)
    - [ ] A4.3 If extracting: create `dashboard-stream.js`, migrate callers, add script tag
    - [ ] A4.4 Validate: `node -c` all changed files + manual SSE smoke test

### Priority 2 — Health / Operability

- [ ] **C1.** Readiness dependency depth review
  - Goal: decide whether `/api/read/readiness` should probe CLI, TaskHub, watchdog
  - Files: `src/backend/services/healthService.js`, `src/backend/routes/api.js`
  - Steps:
    - [ ] C1.1 Read current readiness checks and list what's probed vs. not
    - [ ] C1.2 Decide: add CLI/TaskHub/watchdog probes? (trade-off: accuracy vs. latency)
    - [ ] C1.3 If adding: implement probes with timeout guards
    - [ ] C1.4 Validate: `npx jest tests/healthService.test.js tests/apiRoutes.test.js --testNamePattern="health|readiness"`

- [ ] **C3.** Watchdog optional hardening (from smoke findings)
  - Goal: address 3 minor findings from watchdog smoke test
  - Files: `src/backend/controllers/watchdogController.js`, `src/backend/services/gatewayWatchdog.js`
  - Steps:
    - [ ] C3.1 Add `typeof enabled === 'boolean'` validation to toggle endpoint
    - [ ] C3.2 Add test: 3 consecutive repair failures trigger escalation
    - [ ] C3.3 Wrap module-level `getOpenClawConfig()` in try/catch
    - [ ] C3.4 Validate: `npx jest tests/watchdog*.test.js`

### Priority 3 — Documentation

- [ ] **D1.** Historical docs decision
  - Files: `docs/plans/2026-03-02-*.md`
  - Recommendation: preserve as-is (archival, not runtime)
  - Steps:
    - [ ] D1.1 Review docs/plans/ contents, confirm no stale references
    - [ ] D1.2 Add a one-line README in `docs/plans/` explaining archival purpose

- [ ] **D2.** Architecture snapshot refresh
  - Goal: update README.md and CLAUDE.md to reflect post-Sprint-1 architecture
  - Files: `README.md`, `CLAUDE.md`
  - Prerequisite: do after all code changes are complete
  - Steps:
    - [ ] D2.1 Audit current README.md against actual project structure
    - [ ] D2.2 Update README.md: file tree, module descriptions, API routes
    - [ ] D2.3 Update CLAUDE.md: any new conventions, paths, or quirks
    - [ ] D2.4 Validate: no broken references, consistent with codebase

## Reference Data

### Frontend Globals Inventory

| Type | Count | Description |
|------|-------|-------------|
| state-alias | 16 | Managed by `state.js` via `Object.defineProperty` |
| shared-api | 40 | Cross-module utilities (esc, showToast, renderDashboard, etc.) |
| inline-handler | 39 | Referenced from `index.html` onclick/oninput handlers |
| accidental | ~~52~~ **0** | Eliminated by IIFE wrapping all 7 files |

All 21 JS files use IIFE wrappers. `window.fetch` monkey-patched in `auth-ui.js` for 401 intercept (intentional).

### Watchdog Smoke Findings

- All 36 tests pass (12 + 19 + 5), no blocking issues
- Optional improvements (addressed by C3):
  1. `/watchdog/status` has no auth guard (read-only, low risk)
  2. `/watchdog/toggle` does not validate `req.body.enabled` type
  3. Escalation path (3 consecutive failures) has no test coverage
  4. Module-level `getOpenClawConfig()` call could crash on require if config broken

## Notes For Other AI Workers

- Sprint 1 is complete. All remaining work is **optional**.
- If you touch frontend JS, keep syntax-valid and run `node -c` on changed files.
- If you touch backend routes/controllers, run the narrowest relevant Jest subset.
- Check `git status --short` before each commit — do not stage unrelated files.
- Mark sub-steps `[x]` as you go so other workers can see partial progress.
- Always git-ship (push -> issue -> CI -> close) after completing a task group.
