# Progress

Last updated: 2026-03-07T12:00 Asia/Taipei

## Collaboration Rules

- Main worktree: `/Users/openclaw/.openclaw/shared/projects/agent-monitor-web`
- Frontend worktree: `/Users/openclaw/.openclaw/shared/projects/agent-monitor-web-frontend`
- Commit format: `feat(s1): ...`
- When changing frontend JS, update `index.html` query strings and note cache-busting impact.
- Historical handoff status: both worktrees were clean when Sprint 1 was closed.
- Current observed main worktree status during this handoff:
  - `M progress.md`
  - `M src/frontend/public/index.html`
  - `M src/frontend/public/js/app.js`
  - `M src/frontend/public/js/state.js`
  - `M tests/apiRoutes.test.js`
- Current observed frontend worktree status during this handoff: not revalidated in this pass.
- Rule: do not stage the four non-`progress.md` files above unless their owner explicitly assigns them.

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
- Current state:
  - clean and no unmerged frontend-only changes remain

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
- `25b4575` `feat(s1): clean up watchdog config paths`
- `ac7d45c` `feat(s1): remove legacy controller wrappers`
- `25d3fb1` `feat(s1): add project agent instructions`

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
- `gatewayWatchdog.js` now uses config-driven paths/targets and structured watchdog logging.
- New controller names exist:
  - `dashboardReadController.js`
  - `controlController.js`
- Legacy controller wrapper files are removed.
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

## QA Results — 2026-03-07

### Full Suite QA (Pass 1 — test + syntax)

- **Backend tests:** 32/32 suites, 421/421 tests passed ✅
- **Frontend syntax:** all 21 JS files pass `node -c` ✅
- **Fixes applied:**
  - `tests/optimizeService.test.js`: `saveAndNotify` tests timed out because Telegram mock still targeted the old code path instead of `openclawClient.runArgs` (current path). Added `jest.mock` for `openclawClient` at module level and updated the Telegram-failure test accordingly.

### Deep QA (Pass 2 — integration)

- **Frontend module completeness:** 21 files on disk = 21 script tags in index.html ✅
- **Script load order:** state → stream → api → UI → app → runtime → bootstrap ✅
- **Cross-module globals:** apiClient/appState/streamManager correctly defined and referenced ✅
- **Legacy cleanup:** no legacy controller files or references in src/ or tests/ ✅
- **Backend route integrity:** api.js imports 11 controllers, all files exist ✅
- **Server startup:** starts normally, liveness/readiness endpoints respond correctly ✅
- **Startup validation:** correctly rejects launch when AUTH_PASSWORD_HASH missing ✅
- **Minor finding:** `theme-manager.js` missing cache-busting `?v=` → fixed

### Slice A — Frontend Cleanup (completed)

- Removed 12 redundant global declarations from `app.js` (duplicated by `state.js`)
- Moved `loadErrorKeys`/`saveErrorKeys` + initialization into `state.js`
- `isMobile` now initialized in `state.js` with `matchMedia` result
- Added `?v=20260307` to `theme-manager.js` in `index.html`
- Fixed `apiRoutes.test.js` flaky dashboard test (mocked `dashboardPayloadService` instead of hitting real CLI)

### Slice B — Backend Logger Normalization (completed)

- `dashboardPayloadService.js`: 4 console.error → structured logger (exchange_rate, poller)
- `openclawService.js`: 1 console.error → `logger.error('openclaw_command_failed')`
- `tsdbService.js`: 2 console.error → structured logger (snapshot, cleanup)
- `modelMonitor.js`: 1 console.error → `logger.error('model_monitor_fetch_failed')`
- `adaptive_security_simple.js`: constructor + adjustLevel → structured logger
- `compliance_simple.js`: constructor + analyze → structured logger
- `threat_intelligence_fixed.js`: constructor + loadRules + evaluate + updateRules + saveRules → structured logger
- `threat_intelligence_simple.js`: same pattern as above
- All `if (require.main === module)` self-test blocks left untouched
- **Remaining console.* (low priority):** controlOriginPolicy.js, controlAudit.js, agentWatcherService.js

### Final verification — 32/32 suites, 421/421 tests ✅

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
- `tests/apiRoutes.test.js --testNamePattern="Watchdog Routes"`

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
- Decide whether remaining globals should stay as compatibility shims or move under a shared UI namespace.
- Add cache-busting `?v=` to `theme-manager.js` in `index.html` for consistency.

### Backend

- Extend structured logging/request-id coverage beyond core API middleware into service-level logs.
- Expand dependency health from file checks to richer readiness semantics if desired.
- Optionally replace remaining ad hoc `console.*` usage in security/dashboard payload services with shared logger.

### Docs

- Historical `docs/plans/` files still reference removed `legacyDashboardController.js`.
  Those are archival design notes, not runtime dependencies.
  Only update them if the team wants historical docs normalized.

## Future Task Backlog

### Priority 1 — Low-Risk Final Cleanup

1. ~~Frontend cache-busting consistency~~ ✅ done

2. Frontend global namespace inventory
- Files:
  - `src/frontend/public/js/app.js`
  - `src/frontend/public/js/state.js`
  - `src/frontend/public/js/modules/*.js`
- Task: enumerate all remaining global symbols on `window`, classify as required public API vs accidental leakage.
- Output expectation: add a short table to `progress.md` or a dedicated note under `docs/architecture/`.

3. Frontend compatibility shim decision
- Files:
  - `src/frontend/public/js/state.js`
  - `src/frontend/public/js/app.js`
  - `src/frontend/public/index.html`
- Task: decide whether to keep current globals as-is or move to a single namespace such as `window.ocHud`.
- Validation: if namespacing is introduced, all inline HTML handlers still work or are migrated.

4. Frontend stream wrapper consolidation
- Files:
  - `src/frontend/public/js/stream-manager.js`
  - `src/frontend/public/js/dashboard-runtime.js`
  - `src/frontend/public/js/modules/logs.js`
  - `src/frontend/public/js/optimize-runner.js`
- Task: optionally create `dashboard-stream.js` or equivalent thin wrapper for dashboard-specific SSE semantics.
- Validation: `node -c` on touched files and manual browser smoke check of dashboard updates + log stream + optimize stream.

### Priority 2 — Backend Logging Normalization

5. ~~dashboardPayloadService logger migration~~ ✅ done
6. ~~openclawService logger migration~~ ✅ done
7. ~~tsdbService logger migration~~ ✅ done
8. ~~modelMonitor logger migration~~ ✅ done
9. ~~security module logger migration~~ ✅ done (runtime only; self-test blocks preserved)

### Priority 3 — Health/Operability Enhancements

10. Readiness dependency depth review
- Files:
  - `src/backend/services/healthService.js`
  - `src/backend/routes/api.js`
- Task: decide whether readiness should include richer checks for watchdog/logging/taskhub/openclaw CLI availability beyond current level.
- Validation: run `tests/healthService.test.js` and `tests/apiRoutes.test.js` selectively for health endpoints.

11. Watchdog API smoke review
- Files:
  - `src/backend/services/gatewayWatchdog.js`
  - `src/backend/routes/api.js`
- Task: confirm current watchdog behavior is acceptable after config-driven cleanup; only change further if there is a concrete bug or operability gap.
- Validation: run `tests/gatewayWatchdog.test.js`, `tests/gatewayWatchdogExtended.test.js`, and `tests/apiRoutes.test.js --testNamePattern="Watchdog Routes"`.

### Priority 4 — Documentation / Historical Cleanup

12. Historical docs normalization decision
- Files:
  - `docs/plans/2026-03-02-system-optimization-design.md`
  - `docs/plans/2026-03-02-system-optimization.md`
- Task: decide whether to preserve historical references to `legacyDashboardController.js` as-is or annotate them as historical.
- Recommendation: preserve unless the team explicitly wants historical docs normalized.

13. Architecture snapshot refresh
- Files:
  - `README.md`
  - `CLAUDE.md`
  - optional new `docs/architecture/current-state.md`
- Task: if more cleanup happens, refresh docs once after the code settles instead of piecemeal.
- Validation: `git diff --check` on docs only.

## Complete Task Breakdown

This section expands all remaining work into directly assignable tasks so multiple AI workers can pick up independent slices without re-discovering scope.

### Track A — Frontend Polish / Compatibility

#### A1. Fix cache-busting gap for theme manager

- Goal: make `theme-manager.js` consistent with the rest of the JS asset loading strategy.
- Files:
  - `src/frontend/public/index.html`
- Work:
  - add `?v=YYYYMMDD` to the `theme-manager.js` script tag
  - verify no duplicate or stale script tags exist
- Validation:
  - `node -c src/frontend/public/js/theme-manager.js`
  - manual browser hard refresh

#### A2. Inventory remaining frontend globals

- Goal: understand what still leaks onto `window` and whether it is intentional.
- Files:
  - `src/frontend/public/js/*.js`
  - `src/frontend/public/js/modules/*.js`
- Work:
  - enumerate all `window.*` assignments
  - classify each symbol as one of:
    - required by inline HTML handler
    - shared runtime API used by another module
    - legacy compatibility shim
    - accidental global that can be removed
  - record result in this file or `docs/architecture/current-state.md`
- Validation:
  - `rg -n "window\\." src/frontend/public/js`
  - no code changes required if this is inventory-only

#### A3. Decide compatibility strategy for frontend globals

- Goal: stop drifting between intentional public globals and accidental compatibility residue.
- Files:
  - `src/frontend/public/js/state.js`
  - `src/frontend/public/js/app.js`
  - `src/frontend/public/index.html`
  - any touched UI modules
- Options:
  - keep current globals and document them
  - move stable public APIs under a namespace such as `window.ocHud`
  - leave inline handlers as wrappers and keep the real implementation private
- Work:
  - choose one approach
  - apply only if the compatibility risk is low
- Validation:
  - `node -c` on all touched frontend files
  - manual smoke check for dashboard render, session modal, command modal, logout, optimize

#### A4. Optional dashboard-specific stream wrapper

- Goal: keep `stream-manager.js` generic and put dashboard-specific SSE semantics in a thin adapter if the codebase still needs it.
- Files:
  - `src/frontend/public/js/stream-manager.js`
  - `src/frontend/public/js/dashboard-runtime.js`
  - `src/frontend/public/js/modules/logs.js`
  - `src/frontend/public/js/optimize-runner.js`
- Work:
  - decide whether `dashboard-stream.js` adds clarity
  - if yes, move only dashboard-specific event glue there
- Validation:
  - `node -c` on touched files
  - manual SSE smoke check

### Track B — Backend Logging Normalization

#### B1. dashboardPayloadService logger migration

- Goal: remove remaining `console.error` usage from shared dashboard polling/broadcast flow.
- Files:
  - `src/backend/services/dashboardPayloadService.js`
- Work:
  - replace exchange-rate, poller update, and broadcast failure logs with shared logger
  - preserve current behavior and throttling expectations
- Validation:
  - `npx jest tests/dashboardReadController.test.js tests/dashboardReadControllerCoverage.test.js --runInBand`

#### B2. openclawService logger migration

- Goal: normalize command failure logs with structured fields.
- Files:
  - `src/backend/services/openclawService.js`
- Work:
  - replace raw command failure `console.error`
  - include command or args context without leaking secrets
- Validation:
  - `npx jest tests/openclawService.test.js --runInBand`

#### B3. tsdbService logger migration

- Goal: normalize snapshot and cleanup errors.
- Files:
  - `src/backend/services/tsdbService.js`
- Work:
  - replace remaining `console.error`
  - preserve quiet behavior on non-critical paths
- Validation:
  - run any direct TSDB test if added
  - otherwise `npx jest tests/dashboardReadControllerCoverage.test.js --runInBand`

#### B4. modelMonitor logger migration

- Goal: align model status failure logging with the shared logger.
- Files:
  - `src/backend/utils/modelMonitor.js`
- Work:
  - replace remaining `console.error`
  - include enough context to debug model-status command failures
- Validation:
  - `npx jest tests/modelMonitor.test.js --runInBand`

#### B5. security module logger migration

- Goal: reduce ad hoc boot/runtime logs in the simplified security/compliance modules.
- Files:
  - `src/backend/security/threat_intelligence_fixed.js`
  - `src/backend/security/threat_intelligence_simple.js`
  - `src/backend/security/adaptive_security_simple.js`
  - `src/backend/security/compliance_simple.js`
- Work:
  - inventory runtime/test boot logging
  - move production-path logging to shared logger
  - leave intentional demo noise documented if kept
- Validation:
  - `npx jest tests/securityController.test.js tests/securityAPI.test.js tests/complianceSimple.test.js --runInBand`

### Track C — Health / Operability

#### C1. Deepen readiness dependency semantics

- Goal: decide whether current readiness is sufficient for deployment expectations.
- Files:
  - `src/backend/services/healthService.js`
  - `src/backend/routes/api.js`
- Work:
  - review whether readiness should include:
    - OpenClaw CLI binary resolution
    - TaskHub DB path existence
    - watchdog enabled/configured state
    - cert presence only at startup vs also in health
  - keep this scoped; avoid expensive runtime checks
- Validation:
  - `npx jest tests/healthService.test.js tests/apiRoutes.test.js --runInBand --testNamePattern="health|readiness|dependencies"`

#### C2. Watchdog smoke review

- Goal: confirm no regression after config/logger cleanup.
- Files:
  - `src/backend/services/gatewayWatchdog.js`
  - `src/backend/routes/api.js`
- Work:
  - re-check watchdog status payload and repair path expectations
  - only change if there is a concrete defect
- Validation:
  - `npx jest tests/gatewayWatchdog.test.js tests/gatewayWatchdogExtended.test.js --runInBand`
  - `npx jest tests/apiRoutes.test.js --runInBand --testNamePattern="Watchdog Routes"`

### Track D — Documentation / Handoff

#### D1. Historical docs decision

- Goal: explicitly decide whether old design docs should reflect the new controller names.
- Files:
  - `docs/plans/2026-03-02-system-optimization-design.md`
  - `docs/plans/2026-03-02-system-optimization.md`
- Work:
  - either preserve as historical snapshots
  - or add a short note that `legacyDashboardController.js` was later removed
- Validation:
  - docs-only diff review

#### D2. Architecture snapshot refresh

- Goal: maintain one accurate current-state document after all cleanup ends.
- Files:
  - `README.md`
  - `CLAUDE.md`
  - optional `docs/architecture/current-state.md`
- Work:
  - refresh only once after code settles
  - avoid repeated churn during cleanup-only batches
- Validation:
  - `git diff --check`

## Suggested Parallelization Plan

Use separate worktrees when tasks are independent.

### Worker 1 — Frontend worktree

- Recommended path: `/Users/openclaw/.openclaw/shared/projects/agent-monitor-web-frontend`
- Pick from:
  - A1
  - A2
  - A3
  - A4
- Commit style:
  - `feat(s1): ...`
- Merge strategy:
  - commit in frontend worktree first
  - cherry-pick to `main`

### Worker 2 — Main worktree backend logging

- Recommended tasks:
  - B1
  - B2
  - B3
  - B4
  - B5
- Constraint:
  - check `git status --short` before each commit and do not include unrelated frontend edits

### Worker 3 — Main worktree docs/operability

- Recommended tasks:
  - C1
  - C2
  - D1
  - D2
- Constraint:
  - keep these as narrow docs/health-only batches to avoid mixing with logging refactors

## Batch Templates

### Small Batch Template

1. Confirm ownership of the target files via `git status --short`.
2. Make one focused change.
3. Run the narrowest validating test subset.
4. Update `progress.md`:
   - mark task done
   - record commit hash
   - record exact validation command
5. Commit only the touched files.

### Done Criteria Per Task

- behavior unchanged unless explicitly intended
- tests or syntax checks run and recorded
- `progress.md` updated
- no unrelated files staged
- frontend batches include cache-busting review if script tags changed

## Tasks Explicitly Not Worth Doing Unless Requested

- rewrite archival `docs/plans/*` content for style only
- large frontend namespace rewrite with no concrete bug
- replacing every `console.*` in test-only or intentionally noisy demo paths
- adding new framework/tooling just to finish cleanup

## Execution Order Recommendation

1. Do Priority 1 tasks first only if the team still wants polish work.
2. Do Priority 2 tasks next if the goal is log consistency and quieter tests.
3. Do Priority 3 only when there is a concrete operability requirement.
4. Treat Priority 4 as optional documentation debt, not runtime debt.

## Handoff Notes For Claude Opus

- The primary architectural refactor is done.
- Remaining tasks are cleanup/polish, not core re-architecture.
- The biggest risk now is unnecessary churn: prefer small isolated batches with narrow tests.
- Do not stage unrelated dirty files currently in the worktree; check `git status --short` before each commit.

## Recommended Next Batch Slices

### Slice A

- Worktree: frontend
- Goal: optional final namespace/global cleanup only if the team still wants it
- Files:
  - `src/frontend/public/js/app.js`
  - `src/frontend/public/js/modules/*.js`
  - `src/frontend/public/index.html`

### Slice B

- Worktree: main
- Goal: optional logger normalization in remaining backend services
- Files:
  - `src/backend/services/dashboardPayloadService.js`
  - `src/backend/security/*.js`
  - narrow test subsets only

## Notes For Other AI Workers

- If you work in the frontend worktree again, commit there first, then cherry-pick to `main`.
- If you touch frontend JS, keep syntax-valid and run `node -c` on changed files.
- If you touch backend routes/controllers, run the narrowest relevant Jest subset before commit.
- The primary roadmap items are complete; remaining work is optional cleanup, not core restructuring.
