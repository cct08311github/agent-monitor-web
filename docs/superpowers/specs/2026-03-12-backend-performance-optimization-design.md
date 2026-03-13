# Backend Performance Optimization — Design Spec

**Date:** 2026-03-12
**Scope:** dashboardPayloadService.js, taskHubController.js
**Approach:** Option B — Core bottleneck fix + cache tiering + SQL consolidation
**API Compatibility:** No constraints — front/backend both owned

---

## 1. Async I/O Parallelization

### Problem

`detectDetailedActivity()` and `buildSubagentStatus()` in `dashboardPayloadService.js` use synchronous file system operations (`readFileSync`, `readdirSync`, `statSync`, `existsSync`). These are called for each of the 17 agents serially via `Array.map()`, blocking the Node.js event loop for ~2s per dashboard build.

### Solution

Convert both functions to async and parallelize processing:

**`detectDetailedActivity(agentId)`** changes:
- `fs.existsSync(path)` → `fs.promises.access(path).then(() => true).catch(() => false)`
- `fs.readFileSync(path, 'utf8')` → `fs.promises.readFile(path, 'utf8')`
- `fs.readdirSync(dir)` → `fs.promises.readdir(dir)`
- `fs.statSync(path).mtimeMs` → `(await fs.promises.stat(path)).mtimeMs`

**`buildSubagentStatus()`** changes:
- `fs.readdirSync(AGENTS_ROOT)` → `fs.promises.readdir(AGENTS_ROOT)`
- `fs.existsSync(sessionsPath)` → `fs.promises.access(sessionsPath)` with try-catch
- `fs.readFileSync(sessionsPath, 'utf8')` → `fs.promises.readFile(sessionsPath, 'utf8')`

**Caller in `buildDashboardPayload()`** changes:
```javascript
// Before (serial sync)
const agents = parseAgentsList(stdout).map((a) => {
    const activity = detectDetailedActivity(a.id);
    return { ...a, ...activity };
});
const subagents = buildSubagentStatus();

// After (parallel async)
const agentList = parseAgentsList(stdout);
const [agents, subagents] = await Promise.all([
    Promise.all(
        agentList.map(async (a) => {
            const activity = await detectDetailedActivity(a.id);
            return { ...a, ...activity, model: a.model || activity.activeModel, activeModel: activity.activeModel };
        })
    ),
    buildSubagentStatus(),
]);
```

**Error isolation:** Both `detectDetailedActivity` and `buildSubagentStatus` already have internal try-catch blocks that return safe defaults on failure. This per-agent error isolation is preserved after the async conversion, so a single agent's I/O failure does not break `Promise.all`. No need for `Promise.allSettled`.

### Expected Impact

17 agents serial ~2s (each ~120ms I/O) → parallel ~200ms. Event loop unblocked during I/O.

### Files Modified

- `src/backend/services/dashboardPayloadService.js`

---

## 2. Tiered Cache

### Problem

Single `DASHBOARD_CACHE_TTL_MS = 3000` applies to all data sources. This causes unnecessary CLI calls and file I/O even when data hasn't changed. The 15s polling interval means cache expires ~5 times between polls.

### Solution

Replace single `dashboardCache` with per-source cache:

```javascript
const cache = {
    sys:       { data: null, ts: 0, ttl: 5000 },
    agents:    { data: null, ts: 0, ttl: 10000 },
    subagents: { data: null, ts: 0, ttl: 10000 },
    cron:      { data: null, ts: 0, ttl: 30000 },
    cooldowns: { data: null, ts: 0, ttl: 15000 },
};

function isFresh(entry) {
    return entry.data !== null && Date.now() - entry.ts < entry.ttl;
}
```

| Source | Old TTL | New TTL | Rationale |
|--------|---------|---------|-----------|
| System resources (CPU/Mem/Disk) | 3s | 5s | Moderate change rate, 5s sufficient for monitoring |
| Agent activity | 3s | 10s | Heavy file I/O; agentWatcher events provide immediate invalidation |
| Subagent status | 3s | 10s | Same file I/O pattern as agents; same invalidation strategy |
| Cron list | 3s | 30s | Cron config changes very infrequently |
| OpenClaw version | Once (already cached) | No change | Correct as-is |
| Exchange rate | 24h | No change | Correct as-is |
| Model cooldowns | 3s | 15s | Cooldown state doesn't need sub-second freshness |

**Event-driven invalidation:** agentWatcher `state_update` events invalidate both `cache.agents` and `cache.subagents` immediately, achieving "update on change, cache when idle".

In `buildDashboardPayload()`, each source checks `isFresh()` first. `Promise.all` only runs sources that need refresh.

**Broadcast + cache interaction:** When `doBroadcast()` → `updateSharedData()` → `buildDashboardPayload()` is triggered by an agentWatcher event (outside the 15s poll cycle), the invalidated caches (agents/subagents) will rebuild while other sources (sys, cron, cooldowns) serve from cache if still fresh. This is the intended behavior — event-driven updates only refresh the data that changed.

### Expected Impact

~70% reduction in CLI calls during steady state. Within a 15s poll cycle, most sources serve from cache.

### Files Modified

- `src/backend/services/dashboardPayloadService.js`

---

## 3. TaskHub SQL Consolidation

### Problem

**`getStats()`**: Loops 3 domains x 3 queries each = 9 SQL queries. The `GROUP BY status` result already contains enough information to derive total and active counts.

**`getTasks()`**: When `domain=all`, loops 3 domains with individual queries, then re-sorts in JS.

### Solution

**getStats — 9 queries → 3:**
```javascript
for (const [domain, table] of Object.entries(DOMAIN_TABLES)) {
    const byStatus = conn.prepare(
        `SELECT status, COUNT(*) as n FROM ${table} GROUP BY status`
    ).all();

    const total = byStatus.reduce((sum, r) => sum + r.n, 0);
    const active = byStatus
        .filter(r => !['done', 'archived', 'cancelled'].includes(r.status))
        .reduce((sum, r) => sum + r.n, 0);

    result.domains[domain] = { total, active, by_status: ... };
}
```

**getTasks — 3 queries → 1 (domain=all only):**

Use UNION ALL with explicit column list. Table schemas differ:

| Column | work_tasks | personal_tasks | sideproject_tasks |
|--------|-----------|---------------|-------------------|
| id, title, status, priority, due_date, completed_at | Yes | Yes | Yes |
| parent_id, tags, notes | Yes | Yes | Yes |
| notion_page_id, notion_dirty, notion_synced_at | Yes | Yes | Yes |
| created_at, updated_at | Yes | Yes | Yes |
| assignee | Yes | No | No |
| project | Yes | No | Yes |
| github_repo, github_issue_id, github_pr_id, github_branch | No | No | Yes |
| dev_status, automation_level | No | No | Yes |

UNION ALL requires explicit SELECT with NULL padding:

```javascript
// Common columns shared by all 3 tables
const COMMON_COLS = 'id, title, status, priority, due_date, completed_at, parent_id, tags, notes, notion_page_id, notion_dirty, notion_synced_at, created_at, updated_at';

// Per-domain SELECT with NULL padding for missing columns
const DOMAIN_SELECT = {
    work:        `${COMMON_COLS}, assignee, project, NULL as github_repo, NULL as github_issue_id, NULL as github_pr_id, NULL as github_branch, NULL as dev_status, NULL as automation_level`,
    personal:    `${COMMON_COLS}, NULL as assignee, NULL as project, NULL as github_repo, NULL as github_issue_id, NULL as github_pr_id, NULL as github_branch, NULL as dev_status, NULL as automation_level`,
    sideproject: `${COMMON_COLS}, NULL as assignee, project, github_repo, github_issue_id, github_pr_id, github_branch, dev_status, automation_level`,
};
```

```javascript
if (domain === 'all') {
    const parts = Object.entries(DOMAIN_TABLES).map(([d, table]) =>
        `SELECT ${DOMAIN_SELECT[d]}, '${d}' as domain FROM ${table} WHERE 1=1 ${whereClause}`
    );
    sql = parts.join(' UNION ALL ') + ` ORDER BY ... LIMIT ?`;
}
```

**Single-domain queries remain unchanged** to minimize risk.

### Expected Impact

getStats: 9 → 3 queries. getTasks(all): 3 → 1 query + sort moves to SQLite (more efficient than JS).

### Files Modified

- `src/backend/controllers/taskHubController.js`

---

## 4. Testing Strategy

### Approach

All 3 changes are independent commits. Each must pass the full test suite (currently 448 tests, 36 suites).

| Change | Testing |
|--------|---------|
| Async I/O | Update existing dashboardPayloadService tests to mock `fs.promises` instead of `fs.*Sync` |
| Tiered cache | Add tests: per-source TTL respected, invalidation works, stale data refreshes |
| SQL consolidation | Existing taskHubController tests should pass unchanged (API format preserved). Add test for `domain=all` UNION ALL path |

### Rollback

Each change is an independent commit:
1. Async I/O revert → back to sync (functional, just slower)
2. Cache tiering revert → back to 3s single TTL
3. SQL consolidation revert → back to per-domain queries

### Risk Assessment

| Risk | Level | Mitigation |
|------|-------|------------|
| Missed sync call in async conversion | Medium | grep all `Sync` in modified functions post-implementation |
| Cache TTL too long causing stale data | Low | agentWatcher event-driven invalidation as fallback |
| UNION ALL column mismatch | Low | Column lists derived from verified PRAGMA table_info output (see Section 3) |
| Promise.all rejects on single agent failure | Low | Both async functions have internal try-catch returning safe defaults |
| Event-driven broadcast triggers full rebuild | Low | Only invalidated caches rebuild; fresh caches serve as-is |
