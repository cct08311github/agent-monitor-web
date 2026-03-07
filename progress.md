# Progress

Last updated: 2026-03-08T00:20 Asia/Taipei

## Collaboration Rules

- Main worktree: `/Users/openclaw/.openclaw/shared/projects/agent-monitor-web`
- Frontend worktree: `/Users/openclaw/.openclaw/shared/projects/agent-monitor-web-frontend`
- Commit format: `feat(s2): ...`
- When changing frontend JS, update `index.html` query strings (`?v=YYYYMMDD`).
- Main worktree is currently **not clean**: `package.json`, `package-lock.json`, `server.js` have uncommitted changes.
- Treat those three files as user-owned in-progress work unless explicitly confirmed otherwise.

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
<summary>Frontend IIFE Wrapping + QA Verification (9 items)</summary>

- [x] Wrap non-IIFE modules in IIFEs to eliminate 52 accidental globals (`ce91ecf`)
- [x] Full test suite: 32/32 suites, 421/421 tests
- [x] Frontend syntax: all 21 JS files pass `node -c`
- [x] Frontend module completeness: 21 files = 21 script tags
- [x] Script load order: state -> stream -> api -> UI -> app -> runtime -> bootstrap
- [x] Cross-module globals: apiClient/appState/streamManager correctly wired
- [x] Legacy cleanup: no legacy controller files or references
- [x] Backend route integrity: api.js imports 11 controllers, all exist
- [x] Server startup: starts normally, health endpoints respond

</details>

## Sprint 2 Checklist

Current status: 35/35 suites, 440/440 tests. Sprint 2 watchdog hardening batch is complete. Coverage snapshot still pending refresh after the latest test additions.
Reality check: the checklist below was audited against code/tests on 2026-03-08. Several old "missing test" notes were too strict about filenames and did not reflect broader existing coverage.

### S2-A: Controller-Level Coverage Gaps

Dedicated controller-named suites are still missing for 4 controllers, but this is **not** the same as "no coverage". Existing suites already cover part of the behavior:

- `authController` is partially covered by `tests/authIntegration.test.js`
- `systemController` is partially covered by `tests/systemAPI.test.js`
- `taskHubController` is partially covered by `tests/taskHub.test.js` and `tests/taskHubErrors.test.js`
- `complianceController` currently has no controller/API-focused suite; only the underlying compliance module is covered by `tests/complianceSimple.test.js`

- [x] **S2-A1.** Add `dashboardPayloadService` tests (coverage: 85% stmts, 74% branches — lowest)
  - File: `src/backend/services/dashboardPayloadService.js`
  - Create: `tests/dashboardPayloadService.test.js` (`2026-03-07`)
  - Steps:
    - [x] S2-A1.1 Read service, identify untested branches (lines 71-72, 104, 109-111, 174-176, 201-205, 231, 246-247, 331, 369, 490-535)
    - [x] S2-A1.2 Write tests for exchange rate fetch failure path
    - [x] S2-A1.3 Write tests for poller/shared update edge cases (pending update dedupe, explicit client removal, snapshot persistence)
    - [x] S2-A1.4 Write tests for SSE/polling lifecycle entrypoints (`addSseClient`, `removeSseClient`, `startGlobalPolling`)
    - [x] S2-A1.5 Validate: `npx jest tests/dashboardPayloadService.test.js --runInBand`

- [x] **S2-A2.** Add `sessionReadService` tests
  - File: `src/backend/services/sessionReadService.js`
  - Create: `tests/sessionReadService.test.js` (`2026-03-07`)
  - Steps:
    - [x] S2-A2.1 Read service, identify JSONL parsing edge cases
    - [x] S2-A2.2 Write tests for malformed JSONL lines (silent catch at lines 44, 82, 84)
    - [x] S2-A2.3 Write tests for missing session file / empty file
    - [x] S2-A2.4 Validate: `npx jest tests/sessionReadService.test.js --runInBand`

- [x] **S2-A3.** Add `historyService` tests
  - File: `src/backend/services/historyService.js`
  - Create: `tests/historyService.test.js` (`2026-03-07`)
  - Steps:
    - [x] S2-A3.1 Read service, list public methods
    - [x] S2-A3.2 Write tests for normal history retrieval
    - [x] S2-A3.3 Write tests for error/empty paths
    - [x] S2-A3.4 Validate: `npx jest tests/historyService.test.js --runInBand`

- [ ] **S2-A5.** Add direct controller/API-focused tests where coverage is still indirect
  - Controllers: `authController`, `complianceController`, `systemController`, `taskHubController`
  - Steps:
    - [ ] S2-A5.1 Decide whether to add dedicated `authController` unit tests beyond existing HTTP integration coverage
    - [ ] S2-A5.2 Add `complianceController` endpoint coverage (highest real gap)
    - [ ] S2-A5.3 Decide whether `systemAPI.test.js` is sufficient or should be split/renamed for controller clarity
    - [ ] S2-A5.4 Decide whether `taskHub.test.js` + `taskHubErrors.test.js` are sufficient or should be complemented by a controller-named suite
    - [ ] S2-A5.5 Validate targeted suites plus full `npm test -- --runInBand`

### S2-B: Silent Error Swallowing

After the 2026-03-08 audit, 7 empty `catch {}` blocks remain in Sprint 2 target code:

- `src/backend/services/sessionReadService.js`: 3
- `src/backend/services/optimizeService.js`: 1
- `src/backend/services/gatewayWatchdog.js`: 1
- `src/backend/middlewares/controlAudit.js`: 1
- `src/backend/routes/api.js`: 1

- [x] **S2-B1.** Audit and fix silent catches in `dashboardPayloadService.js` (7 occurrences)
  - Lines: 87, 200, 206, 217, 356, 409, 442
  - Steps:
    - [x] S2-B1.1 Read each catch block, classify: intentional (parse fallback) vs. hiding real errors
    - [x] S2-B1.2 Add `logger.warn(...)` to catches that could hide real failures
    - [x] S2-B1.3 Leave intentional parse-fallback catches as-is (add comment)
    - [x] S2-B1.4 Validate: `npx jest tests/dashboardPayloadService.test.js tests/dashboardReadController*.test.js --runInBand`

- [ ] **S2-B2.** Audit silent catches in remaining files
  - `sessionReadService.js` (lines 44, 82, 84) — likely intentional JSONL parse/read fallbacks, but document intent
  - `optimizeService.js` (line 36) — existing plans directory read fallback
  - `gatewayWatchdog.js` (line 256) — Gemini CLI lookup fallback
  - `controlAudit.js` (line 60) — audit hook failure should not break response, but should likely be logged
  - `api.js` (line 207) — log-stream child process kill fallback
  - Steps:
    - [ ] S2-B2.1 Classify each: intentional fallback vs. error hiding
    - [ ] S2-B2.2 Add logger or comment as appropriate
    - [ ] S2-B2.3 Validate: `npx jest --forceExit`

### S2-C: Watchdog Hardening

From Sprint 1 smoke findings. Low risk, small scope.

- [x] **S2-C1.** Add `enabled` type validation to toggle endpoint
  - File: `src/backend/routes/api.js`
  - Commit: `83bb755` (`2026-03-07`)
  - Steps:
    - [x] S2-C1.1 Add `typeof enabled !== 'boolean'` -> 400 response
    - [x] S2-C1.2 Add test for non-boolean `enabled` value
    - [x] S2-C1.3 Validate: `npx jest tests/apiRoutes.test.js --runInBand --testNamePattern="Watchdog Routes"`

- [x] **S2-C2.** Add escalation path test coverage
  - File: `src/backend/services/gatewayWatchdog.js`
  - Commit: `83bb755` (`2026-03-07`)
  - Steps:
    - [x] S2-C2.1 Read escalation logic and identify the real accumulation path (`healthCheckLoop`, not `triggerRepair`)
    - [x] S2-C2.2 Add test: failed auto-repair escalates and sends alert
    - [x] S2-C2.3 Validate: `npx jest tests/gatewayWatchdog*.test.js --runInBand`

- [x] **S2-C3.** Wrap module-level `getOpenClawConfig()` in try/catch
  - File: `src/backend/services/gatewayWatchdog.js`
  - Commit: `83bb755` (`2026-03-07`)
  - Steps:
    - [x] S2-C3.1 Wrap top-level config read in try/catch with logger.error fallback
    - [x] S2-C3.2 Add config-fallback regression test
    - [x] S2-C3.3 Validate: `npx jest tests/gatewayWatchdogExtended.test.js --runInBand --testNamePattern="module config fallback"`

### S2-D: Frontend Polish

- [ ] **S2-D1.** Dashboard-specific stream wrapper (decision needed)
  - Goal: evaluate whether SSE logic in dashboard/logs/optimize should share a thin wrapper
  - Files: `stream-manager.js`, `dashboard-runtime.js`, `modules/logs.js`, `optimize-runner.js`
  - Steps:
    - [ ] S2-D1.1 Audit SSE usage across 4 files, list shared vs. unique patterns
    - [ ] S2-D1.2 Decide: extract `dashboard-stream.js` or keep as-is (document rationale)
    - [ ] S2-D1.3 If extracting: create wrapper, migrate callers, add script tag
    - [ ] S2-D1.4 Validate: `node -c` all changed files + manual SSE smoke test

### S2-E: Documentation

- [ ] **S2-E1.** Historical docs decision
  - Files: `docs/plans/2026-03-02-*.md`
  - Steps:
    - [ ] S2-E1.1 Review docs/plans/ contents, confirm no stale references
    - [ ] S2-E1.2 Add one-line README in `docs/plans/` explaining archival purpose

- [ ] **S2-E2.** Architecture snapshot refresh
  - Goal: update README.md and CLAUDE.md to reflect post-Sprint-1 architecture
  - Prerequisite: do after all S2 code changes are complete
  - Steps:
    - [ ] S2-E2.1 Audit README.md against actual project structure
    - [ ] S2-E2.2 Update README.md: file tree, module descriptions, API routes
    - [ ] S2-E2.3 Update CLAUDE.md: new conventions, paths, quirks
    - [ ] S2-E2.4 Validate: no broken references, consistent with codebase

## Reference Data

### Coverage Snapshot (Sprint 1 end)

```
Statements: 95.82% (1997/2084)
Branches:   87.82% (923/1051)
Functions:  95.69% (289/302)
Lines:      97.24% (1833/1885)
```

Lowest-coverage files:
- `dashboardPayloadService.js`: 85% stmts, 74% branches
- `optimizeService.js`: 94% stmts, 86% branches

### Untested Modules

Controller-level test naming still inconsistent. Real coverage state:
`authController` (partial), `complianceController` (gap), `sessionService` (covered inside `auth.test.js` and `authIntegration.test.js`), `systemController` (partial), `taskHubController` (partial)

### Frontend Globals Inventory

| Type | Count | Description |
|------|-------|-------------|
| state-alias | 16 | Managed by `state.js` via `Object.defineProperty` |
| shared-api | 40 | Cross-module utilities (esc, showToast, renderDashboard, etc.) |
| inline-handler | 39 | Referenced from `index.html` onclick/oninput handlers |
| accidental | ~~52~~ **0** | Eliminated by IIFE wrapping all 7 files |

### Watchdog Smoke Findings

- Resolved in `83bb755`
- Addressed items:
  1. `/watchdog/toggle` now rejects non-boolean `enabled` with `400 invalid_enabled`
  2. Escalation path now has regression coverage through `healthCheckLoop`
  3. Module-level config read now has logger-backed fallback path instead of crashing

## Recent QA

- [x] 2026-03-07 watchdog hardening batch
  - Commit: `83bb755`
  - QA:
    - [x] `NODE_PATH=/Users/openclaw/.openclaw/shared/projects/agent-monitor-web/node_modules /Users/openclaw/.openclaw/shared/projects/agent-monitor-web/node_modules/.bin/jest tests/gatewayWatchdog.test.js tests/gatewayWatchdogExtended.test.js tests/apiRoutes.test.js --runInBand`
    - [x] `npm test -- --runInBand`
  - Result:
    - [x] `35/35` suites passed
    - [x] `440/440` tests passed
- [x] 2026-03-08 progress + branch audit
  - Verified against:
    - [x] current `main` code
    - [x] `npm test -- --runInBand`
    - [x] local branch ancestry / diff
  - Findings:
    - [x] `progress.md` previously overstated "clean worktrees"
    - [x] controller coverage gaps were overstated by filename-based checklisting
    - [x] 7 empty catch blocks still remain in Sprint 2 target files
    - [x] no branch with unique, still-needed functional changes was found outside `main`

## Branch Reconciliation

- `main` is ahead of `origin/main` by 6 commits and contains the Sprint 2 progress/test/hardening work.
- Non-merged branch heads were audited on 2026-03-08:
  - `codex/frontend-split`: frontend modularization is already present on `main` via different commit hashes
  - `codex/watchdog-hardening`: watchdog hardening is already present on `main` via commit `83bb755`
  - `backup/local-main-e3b80c6`: backup branch only carries an old mobile-chat-button removal already represented on `main`
  - `feat/issue-39-bug--openclaw`: its single extra commit removes a duplicate mobile chat button, but that behavior is already present on `main` via earlier equivalent changes
- Conclusion: there is currently **no pending branch that must be merged for code completeness**.
- Blocking note: because `package.json`, `package-lock.json`, and `server.js` are dirty on `main`, do not perform branch merges until those user changes are either committed or stashed intentionally.

## Next Checklist

Use the batches below as independent ownership units. One AI should own one batch at a time.

### Batch A — Controller Test Coverage

- [ ] Owner:
- [ ] Suggested worktree: `codex/s2-controller-tests`
- [ ] Scope:
  - [ ] **S2-A5.1** Add missing direct coverage for `complianceController` first
  - [ ] **S2-A5.2** Decide whether auth/system/taskHub need new controller-named suites or only checklist normalization
  - [ ] **S2-A5.3** If new suites are added, keep them additive rather than duplicating existing route/integration assertions
- [ ] Validate:
  - [ ] targeted Jest for any newly added suites
  - [ ] `npm test -- --runInBand` after cherry-pick to main
- [ ] Done when:
  - [ ] actual coverage gaps are closed or explicitly documented as intentionally covered elsewhere
  - [ ] no behavior regressions in API route / integration tests
  - [ ] `progress.md` counts are updated

### Batch B — Silent Catch Audit

- [ ] Owner:
- [ ] Suggested worktree: `codex/s2-silent-catch-audit`
- [ ] Scope:
  - [ ] **S2-B2.1** Audit remaining silent catches in [sessionReadService.js](/Users/openclaw/.openclaw/shared/projects/agent-monitor-web/src/backend/services/sessionReadService.js)
  - [ ] **S2-B2.2** Audit remaining silent catches in [optimizeService.js](/Users/openclaw/.openclaw/shared/projects/agent-monitor-web/src/backend/services/optimizeService.js)
  - [ ] **S2-B2.3** Audit remaining silent catches in [gatewayWatchdog.js](/Users/openclaw/.openclaw/shared/projects/agent-monitor-web/src/backend/services/gatewayWatchdog.js)
  - [ ] **S2-B2.4** Audit remaining silent catches in [controlAudit.js](/Users/openclaw/.openclaw/shared/projects/agent-monitor-web/src/backend/middlewares/controlAudit.js)
  - [ ] **S2-B2.5** Audit remaining silent catch in [api.js](/Users/openclaw/.openclaw/shared/projects/agent-monitor-web/src/backend/routes/api.js)
- [ ] Steps:
  - [ ] classify each catch as intentional fallback vs hidden failure
  - [ ] add comment for intentional fallback
  - [ ] add structured logger for hidden failure paths
  - [ ] add or update tests where log-worthy behavior changes
- [ ] Validate:
  - [ ] `npx jest tests/sessionReadService.test.js tests/gatewayWatchdogExtended.test.js tests/authIntegration.test.js --runInBand`
  - [ ] `npm test -- --runInBand` after cherry-pick to main
- [ ] Done when:
  - [ ] no unexplained empty `catch {}` remain in Sprint 2 target files
  - [ ] `progress.md` silent-catch section is updated

### Batch C — Frontend SSE Decision

- [ ] Owner:
- [ ] Suggested worktree: `codex/s2-frontend-streams`
- [ ] Scope:
  - [ ] **S2-D1.1** Audit SSE usage across [stream-manager.js](/Users/openclaw/.openclaw/shared/projects/agent-monitor-web/src/frontend/public/js/stream-manager.js), [dashboard-runtime.js](/Users/openclaw/.openclaw/shared/projects/agent-monitor-web/src/frontend/public/js/dashboard-runtime.js), [logs.js](/Users/openclaw/.openclaw/shared/projects/agent-monitor-web/src/frontend/public/js/modules/logs.js), [optimize-runner.js](/Users/openclaw/.openclaw/shared/projects/agent-monitor-web/src/frontend/public/js/optimize-runner.js)
  - [ ] **S2-D1.2** Decide whether a dashboard-specific stream wrapper should exist
  - [ ] **S2-D1.3** If yes, implement it and wire scripts/query strings
- [ ] Validate:
  - [ ] `node -c` all changed frontend JS files
  - [ ] manual smoke check for dashboard stream + logs stream + optimize stream
- [ ] Done when:
  - [ ] decision is documented in `progress.md`
  - [ ] if code changed, `index.html` cache-busting is updated

### Batch D — Docs And Archive Cleanup

- [ ] Owner:
- [ ] Suggested worktree: `codex/s2-doc-refresh`
- [ ] Dependencies:
  - [ ] start only after Batch A and Batch B are merged, or limit scope to archival note only
- [ ] Scope:
  - [ ] **S2-E1.1** Review `docs/plans/` for stale references and add archival note
  - [ ] **S2-E2.1** Refresh [README.md](/Users/openclaw/.openclaw/shared/projects/agent-monitor-web/README.md) and [CLAUDE.md](/Users/openclaw/.openclaw/shared/projects/agent-monitor-web/CLAUDE.md) architecture snapshot after Sprint 2 closes
- [ ] Validate:
  - [ ] references point to existing files
  - [ ] README / CLAUDE wording matches current architecture
- [ ] Done when:
  - [ ] docs no longer mention removed legacy controllers
  - [ ] Sprint 2 state in docs matches `progress.md`

### Merge Order

- [ ] Resolve or explicitly shelve the dirty `main` changes in `package.json`, `package-lock.json`, `server.js`
- [ ] Merge Batch B before Batch D so docs do not fossilize stale silent-catch counts
- [ ] Merge Batch A anytime after Batch B planning is clarified
- [ ] Merge Batch C anytime; low coupling
- [ ] Merge Batch D last unless it only adds archival note

### Handoff Update Rules

- [ ] Before starting a batch, fill in `Owner:` and worktree branch if changed
- [ ] After each subtask, mark the checkbox directly in `progress.md`
- [ ] After each batch lands, update:
  - [ ] `Last updated`
  - [ ] `Current status`
  - [ ] `Recent QA`
  - [ ] `Branch Reconciliation` if branch state changed
  - [ ] `Sprint 2 Work Log`

## Notes For Other AI Workers

- Sprint 1 is complete. Sprint 2 focuses on **test coverage, error hygiene, and hardening**.
- Commit format is now `feat(s2): ...`.
- If you touch frontend JS, keep syntax-valid and run `node -c` on changed files.
- If you touch backend routes/controllers, run the narrowest relevant Jest subset.
- Check `git status --short` before each commit — do not stage unrelated files.
- Mark sub-steps `[x]` as you go so other workers can see partial progress.
- Always git-ship (push -> issue -> CI -> close) after completing a task group.
- S2-A tasks (test coverage) are independent and can be parallelized across workers.
- S2-B (silent catches) depends on understanding from S2-A1 for dashboardPayloadService.
- S2-E2 (docs refresh) should be done last, after all code changes settle.

## Sprint 2 Work Log

### 2026-03-07 — Coverage batch 1

- Completed:
  - [x] `tests/historyService.test.js` added
  - [x] `tests/sessionReadService.test.js` added
- Scope covered:
  - history payload happy path
  - empty history payload path
  - session param validation
  - missing session file path
  - JSONL malformed-line tolerance
  - session list sorting / trim-to-20 behavior
  - session read failure fallback behavior
- Validation:
  - [x] `npx jest tests/historyService.test.js tests/sessionReadService.test.js --runInBand`
  - [x] `npx jest tests/dashboardReadController.test.js tests/dashboardReadControllerCoverage.test.js --runInBand`
  - [x] `npm test -- --runInBand`

### 2026-03-07 — Coverage batch 2

- Completed:
  - [x] `tests/dashboardPayloadService.test.js` added
- Scope covered:
  - shared payload update success path
  - sensitive path redaction and workspace masking
  - alert emission to SSE clients
  - pending update dedupe
  - single-start polling guard
  - explicit SSE client removal
  - `runOpenclawRead()` forwarding
- Validation:
  - [x] `npx jest tests/dashboardPayloadService.test.js --runInBand`
  - [x] `npx jest tests/dashboardReadController.test.js tests/dashboardReadControllerCoverage.test.js --runInBand`
  - [x] `npm test -- --runInBand`

### 2026-03-07 — Error hygiene batch 1

- Completed:
  - [x] `dashboardPayloadService.js` silent catch audit
- Scope covered:
  - kept binary-probe and OS-specific metric fallback catches intentionally silent with comments
  - added `logger.warn` for agent activity read failure
  - added `logger.warn` for malformed subagent `sessions.json`
  - added `logger.warn` for invalid cron JSON
  - added dedicated tests for the new warning paths
- Validation:
  - [x] `npx jest tests/dashboardPayloadService.test.js --runInBand`
  - [x] `npx jest tests/dashboardReadController.test.js tests/dashboardReadControllerCoverage.test.js --runInBand`
  - [x] `npm test -- --runInBand`

### 2026-03-07 — Watchdog hardening batch

- Completed:
  - [x] `gatewayWatchdog.js` top-level config fallback hardening
  - [x] `/api/watchdog/toggle` boolean validation
  - [x] watchdog escalation regression coverage
- Scope covered:
  - module-level config load now falls back safely with structured logging
  - invalid `enabled` payloads now fail fast with `400 invalid_enabled`
  - escalation path is covered through `healthCheckLoop` instead of the non-accumulating `triggerRepair` path
- Validation:
  - [x] `NODE_PATH=/Users/openclaw/.openclaw/shared/projects/agent-monitor-web/node_modules /Users/openclaw/.openclaw/shared/projects/agent-monitor-web/node_modules/.bin/jest tests/gatewayWatchdog.test.js tests/gatewayWatchdogExtended.test.js tests/apiRoutes.test.js --runInBand`
  - [x] `npm test -- --runInBand`
