# Progress

Last updated: 2026-03-07 Asia/Taipei

## Collaboration Rules

- Main worktree: `/Users/openclaw/.openclaw/shared/projects/agent-monitor-web`
- Frontend worktree: `/Users/openclaw/.openclaw/shared/projects/agent-monitor-web-frontend`
- Do not touch user-owned dirty files:
  - `src/backend/services/gatewayWatchdog.js`
  - `AGENTS.md`
- Commit format: `feat(s1): ...`
- When changing frontend JS, update `index.html` query strings and note cache-busting impact.

## Current Worktree Split

### Main worktree

- Purpose: integration, backend refactor, cherry-pick frontend batches back to `main`
- Branch: `main`
- Safe areas:
  - `src/backend/**`
  - `tests/**`
  - `progress.md`
  - integrated frontend files after frontend worktree commits are ready

### Frontend worktree

- Path: `/Users/openclaw/.openclaw/shared/projects/agent-monitor-web-frontend`
- Branch: `codex/frontend-split`
- Purpose: frontend modularization and low-risk JS refactors before cherry-pick to `main`
- Current focus:
  - `src/frontend/public/js/app.js`
  - `src/frontend/public/js/modules/*.js`
  - `src/frontend/public/index.html`

## Completed Batches

### Backend

- `daf2227` `feat(s1): centralize backend config and startup validation`
- `e2a697d` `feat(s1): split auth middleware and require control token`
- `1a39c8d` `feat(s1): add shared openclaw client`
- `62c323c` `feat(s1): remove remaining backend path hardcoding`
- `a7485dd` `feat(s1): extract dashboard read services`
- `7459ee0` `feat(s1): extract dashboard payload service`
- `d97e9a1` `feat(s1): standardize api error responses`
- `9ddd0b7` `feat(s1): unify management api responses`
- `1044158` `feat(s1): align controller api responses`
- `63af241` `feat(s1): add readiness and dependency health endpoints`
- `40aa47c` `feat(s1): replace legacy controller entrypoints`
- `2b6b157` `feat(s1): add request context logging`
- `a31fab7` `feat(s1): align controller test naming`
- `8db5918` `feat(s1): add structured controller logging`
- pending commit in main worktree: gatewayWatchdog config/logging cleanup

### Frontend

- `85a6e80` `feat(s1): add frontend api client`
- `e82586d` `feat(s1): route app data requests through api client`
- `3fc4b6c` `feat(s1): move command interactions to api client`
- `34611f7` `feat(s1): centralize frontend dashboard state`
- `0cdac1a` `feat(s1): add frontend stream manager`
- `6e75fca` `feat(s1): split app command and error modules`
- `9e36c20` `feat(s1): split app navigation and detail modules`
- `87045b4` `feat(s1): split app runtime modules`
- `4d2bc79` `feat(s1): split app bootstrap runtime`
- `d5c3889` `feat(s1): split dashboard render modules`

## Current Architecture Improvements Already Landed

### Backend

- Central config module and startup validation exist.
- Auth is split into focused middleware.
- Control token fallback secret is removed.
- OpenClaw CLI calls are centralized.
- Dashboard read logic and payload building are extracted into services.
- API response helper and express error handling exist.
- Readiness/liveness/dependency endpoints exist.
- Request context middleware exists with `x-request-id` propagation and structured API request/error logs.
- Cron/control/taskhub controllers now emit structured logger events instead of raw `console.*`.
- `gatewayWatchdog.js` cleanup is in progress on main: config-driven paths/targets and structured watchdog logging.
- New controller names exist:
  - `dashboardReadController.js`
  - `controlController.js`
- Legacy controller files remain as compatibility wrappers.
- Test entrypoints now target `dashboardReadController` / `controlController` naming instead of `legacy*`.

### Frontend

- Shared `api-client.js` exists.
- Shared `state.js` exists with `window.appState` aliases.
- Shared `stream-manager.js` exists.
- Shared `navigation.js` exists for desktop/sub-tab switching and summary card updates.
- Shared `detail-view.js` exists for agent detail rendering and session modal flows.
- Shared `command-actions.js` exists for command execution and output modal handling.
- Shared `error-center.js` exists for dashboard error banners, SRE flows, and error helpers.
- Shared `watchdog-ui.js`, `auth-ui.js`, and `optimize-runner.js` own runtime control flows previously in `app.js`.
- Shared `dashboard-runtime.js` and `bootstrap.js` own SSE/bootstrap lifecycle setup.
- Shared `alert-config.js` and `dashboard-render.js` own alert config, alert detection, and dashboard card/grid rendering.
- `charts.js`, `cron.js`, `taskhub.js`, `chat.js`, and large parts of `app.js` already use `window.apiClient`.
- Dashboard stream, log stream, and optimize stream now go through `stream-manager.js`.
- `app.js` is now down to roughly 120 lines of shared utilities/data update glue.

## Verified Test/Validation Coverage

### Backend tests already run successfully in prior batches

- `tests/config.test.js`
- `tests/startup.test.js`
- `tests/auth.test.js`
- `tests/authIntegration.test.js`
- `tests/apiRoutes.test.js`
- `tests/cronController.test.js`
- `tests/controlController.test.js`
- `tests/openclawClient.test.js`
- `tests/openclawService.test.js`
- `tests/optimizeService.test.js`
- `tests/agentWatcher.test.js`
- `tests/modelMonitor.test.js`
- `tests/taskHub.test.js`
- `tests/taskHubErrors.test.js`
- `tests/dashboardReadController.test.js`
- `tests/dashboardReadControllerCoverage.test.js`
- `tests/securityController.test.js`
- `tests/securityAPI.test.js`
- `tests/systemAPI.test.js`
- `tests/complianceSimple.test.js`
- `tests/agentController.test.js`
- `tests/alertController.test.js`
- `tests/healthService.test.js`
- `tests/requestContext.test.js`
- `tests/gatewayWatchdog.test.js`
- `tests/gatewayWatchdogExtended.test.js`

### Frontend validation already run

- `node -c src/frontend/public/js/api-client.js`
- `node -c src/frontend/public/js/state.js`
- `node -c src/frontend/public/js/stream-manager.js`
- `node -c src/frontend/public/js/navigation.js`
- `node -c src/frontend/public/js/detail-view.js`
- `node -c src/frontend/public/js/error-center.js`
- `node -c src/frontend/public/js/command-actions.js`
- `node -c src/frontend/public/js/app.js`
- `node -c src/frontend/public/js/modules/charts.js`
- `node -c src/frontend/public/js/modules/cron.js`
- `node -c src/frontend/public/js/modules/taskhub.js`
- `node -c src/frontend/public/js/modules/chat.js`
- `node -c src/frontend/public/js/modules/logs.js`
- `node -c src/frontend/public/js/watchdog-ui.js`
- `node -c src/frontend/public/js/auth-ui.js`
- `node -c src/frontend/public/js/optimize-runner.js`
- `node -c src/frontend/public/js/dashboard-runtime.js`
- `node -c src/frontend/public/js/bootstrap.js`
- `node -c src/frontend/public/js/alert-config.js`
- `node -c src/frontend/public/js/dashboard-render.js`
- `node -c src/backend/services/gatewayWatchdog.js`

## Remaining High-Value Work

### Frontend

- Reduce direct global alias usage in modules and move to explicit imports/globals via `window.appState`.
- Consider a dedicated `dashboard-stream.js` wrapper over `stream-manager.js`.
- Continue shrinking `app.js` around watchdog/auth/bootstrap logic if worth the churn.
- Decide whether remaining helpers should stay global or move under a shared UI namespace.

### Backend

- Continue retiring `legacy` naming in tests/docs once wrappers are no longer needed.
- Extend structured logging/request-id coverage beyond core API middleware into service-level logs.
- Expand dependency health from file checks to richer readiness semantics if desired.

### Docs

- Update README/CLAUDE/architecture notes to reflect:
  - `api-client.js`
  - `state.js`
  - `stream-manager.js`
  - controller renames and compatibility wrappers
  - latest frontend split modules and `app.js` shrink

## Recommended Next Batch Slices

### Slice A

- Worktree: frontend
- Goal: reduce remaining `app.js` render/helper surface only where ownership becomes clearer
- Files:
  - `src/frontend/public/js/app.js`
  - `src/frontend/public/js/modules/*.js`
  - optional new helper modules only if they cut clear responsibility boundaries

### Slice B

- Worktree: main
- Goal: update docs and remove outdated `legacy*` references from docs/tests where safe
- Files:
  - `README.md`
  - `CLAUDE.md`
  - `progress.md`
  - selective tests/comments only when compatibility is preserved

## Notes For Other AI Workers

- If you work in the frontend worktree, commit there first, then cherry-pick to `main`.
- Do not reset or overwrite `gatewayWatchdog.js`.
- If you touch frontend JS, keep syntax-valid and run `node -c` on changed files.
- If you touch backend routes/controllers, run the narrowest relevant Jest subset before commit.
