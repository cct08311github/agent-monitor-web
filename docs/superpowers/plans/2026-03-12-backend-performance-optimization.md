# Backend Performance Optimization Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce dashboard build latency by ~80% through async I/O parallelization, tiered caching, and SQL query consolidation.

**Architecture:** Three independent changes to `dashboardPayloadService.js` (async I/O + tiered cache) and `taskHubController.js` (SQL consolidation). Each change is a separate commit with its own tests.

**Tech Stack:** Node.js, Express, better-sqlite3, Jest

**Spec:** `docs/superpowers/specs/2026-03-12-backend-performance-optimization-design.md`

---

## Chunk 1: Async I/O Parallelization

### Task 1: Convert `detectDetailedActivity` to async

**Files:**
- Modify: `src/backend/services/dashboardPayloadService.js` — `detectDetailedActivity` function
- Modify: `tests/dashboardPayloadService.test.js` — update fs mocks

- [ ] **Step 1: Update test mocks to support `fs.promises`**

In `tests/dashboardPayloadService.test.js`, the `mockFs` object (line 3-8) currently only mocks sync methods. Add `promises` namespace:

```javascript
const mockFs = {
    existsSync: jest.fn(),
    readFileSync: jest.fn(),
    readdirSync: jest.fn(),
    statSync: jest.fn(),
    promises: {
        access: jest.fn(),
        readFile: jest.fn(),
        readdir: jest.fn(),
        stat: jest.fn(),
    },
};
```

**CRITICAL:** Also update the `beforeEach` mock reset loop (line 140) to handle the nested `promises` object. The current code `Object.values(mockFs).forEach((fn) => fn.mockReset())` will crash because `mockFs.promises` is not a Jest mock function:

```javascript
// Before (will crash with promises object)
Object.values(mockFs).forEach((fn) => fn.mockReset());

// After
Object.values(mockFs).forEach((fn) => typeof fn.mockReset === 'function' && fn.mockReset());
Object.values(mockFs.promises).forEach((fn) => fn.mockReset());
```

Update `configureFsForDashboard()` (line 73-96) to configure both sync and async mocks. The async versions should mirror the sync behavior:

```javascript
function configureFsForDashboard({ sessionsJson = '{}', latestLog = '' } = {}) {
    const openclawRoot = '/tmp/home/.openclaw';
    const agentsRoot = path.join(openclawRoot, 'agents');
    const sessionsDir = path.join(agentsRoot, 'main', 'sessions');
    const sessionsJsonPath = path.join(sessionsDir, 'sessions.json');
    const latestLogPath = path.join(sessionsDir, 'session1.jsonl');

    // Sync mocks (kept for resolveOpenclawBin which still uses existsSync)
    mockFs.existsSync.mockImplementation((targetPath) => (
        targetPath === path.join(openclawRoot, 'bin', 'openclaw') ||
        targetPath === sessionsDir ||
        targetPath === sessionsJsonPath
    ));

    // Async mocks for detectDetailedActivity + buildSubagentStatus
    mockFs.promises.access.mockImplementation((targetPath) => {
        if (targetPath === sessionsDir ||
            targetPath === sessionsJsonPath) {
            return Promise.resolve();
        }
        return Promise.reject(new Error('ENOENT'));
    });
    mockFs.promises.readdir.mockImplementation((targetPath) => {
        if (targetPath === sessionsDir) return Promise.resolve(latestLog ? ['session1.jsonl'] : []);
        if (targetPath === agentsRoot) return Promise.resolve(['main']);
        return Promise.resolve([]);
    });
    mockFs.promises.stat.mockResolvedValue({ mtimeMs: Date.now() - 120000 });
    mockFs.promises.readFile.mockImplementation((targetPath) => {
        if (targetPath === sessionsJsonPath) return Promise.resolve(sessionsJson);
        if (targetPath === latestLogPath) return Promise.resolve(latestLog);
        return Promise.reject(new Error(`unexpected path ${targetPath}`));
    });

    // Keep sync readdirSync/readFileSync/statSync for any remaining sync callers
    mockFs.readdirSync.mockImplementation((targetPath) => {
        if (targetPath === sessionsDir) return latestLog ? ['session1.jsonl'] : [];
        if (targetPath === agentsRoot) return ['main'];
        return [];
    });
    mockFs.statSync.mockReturnValue({ mtimeMs: Date.now() - 120000 });
    mockFs.readFileSync.mockImplementation((targetPath) => {
        if (targetPath === sessionsJsonPath) return sessionsJson;
        if (targetPath === latestLogPath) return latestLog;
        throw new Error(`unexpected path ${targetPath}`);
    });
}
```

- [ ] **Step 2: Run tests to verify mocks don't break existing tests**

Run: `npm test -- --testPathPattern=dashboardPayloadService 2>&1 | tail -5`
Expected: All existing tests PASS (no behavior change yet)

- [ ] **Step 3: Convert `detectDetailedActivity` to async in source**

In `src/backend/services/dashboardPayloadService.js`, convert `detectDetailedActivity` (currently line 267-383):

Key changes inside the function:
- `function detectDetailedActivity(agentId)` → `async function detectDetailedActivity(agentId)`
- Line ~284: `fs.existsSync(sessionJsonPath)` → `await fs.promises.access(sessionJsonPath).then(() => true).catch(() => false)`
- Line ~285: `JSON.parse(fs.readFileSync(sessionJsonPath, 'utf8'))` → `JSON.parse(await fs.promises.readFile(sessionJsonPath, 'utf8'))`
- Line ~336: `fs.existsSync(agentDir)` → `await fs.promises.access(agentDir).then(() => true).catch(() => false)`
- Line ~337-339: `fs.readdirSync(agentDir).filter(...).map(f => ({ name: f, time: fs.statSync(...).mtimeMs }))` → use `fs.promises.readdir` + `Promise.all` with `fs.promises.stat`:

```javascript
const allFiles = await fs.promises.readdir(agentDir);
const jsonlFiles = allFiles.filter(f => f.endsWith('.jsonl'));
const filesWithTime = await Promise.all(
    jsonlFiles.map(async (f) => ({
        name: f,
        time: (await fs.promises.stat(path.join(agentDir, f))).mtimeMs,
    }))
);
const files = filesWithTime.sort((a, b) => b.time - a.time);
```

- Line ~344: `fs.readFileSync(path.join(agentDir, files[0].name), 'utf8')` → `await fs.promises.readFile(path.join(agentDir, files[0].name), 'utf8')`

- [ ] **Step 4: Update caller in `buildDashboardPayload` to use async parallel**

In `buildDashboardPayload()` (currently line 452-455), replace the sync `.map()`:

```javascript
// Before
const agents = parseAgentsList(agentsResult.stdout || '').map((a) => {
    const activity = detectDetailedActivity(a.id);
    return { ...a, ...activity, model: a.model || activity.activeModel, activeModel: activity.activeModel };
});

// After
const agentList = parseAgentsList(agentsResult.stdout || '');
const agents = await Promise.all(
    agentList.map(async (a) => {
        const activity = await detectDetailedActivity(a.id);
        return { ...a, ...activity, model: a.model || activity.activeModel, activeModel: activity.activeModel };
    })
);
```

- [ ] **Step 5: Run tests to verify async conversion works**

Run: `npm test -- --testPathPattern=dashboardPayloadService 2>&1 | tail -5`
Expected: All tests PASS

- [ ] **Step 6: Run full test suite**

Run: `npm test 2>&1 | tail -5`
Expected: All 448 tests PASS, 36 suites

### Task 2: Convert `buildSubagentStatus` to async

**Files:**
- Modify: `src/backend/services/dashboardPayloadService.js` — `buildSubagentStatus` function

- [ ] **Step 1: Convert `buildSubagentStatus` to async**

In `src/backend/services/dashboardPayloadService.js`, convert `buildSubagentStatus` (currently line 385-432):

- `function buildSubagentStatus()` → `async function buildSubagentStatus()`
- Line ~388: `fs.readdirSync(AGENTS_ROOT)` → `await fs.promises.readdir(AGENTS_ROOT)`
- Line ~391: `fs.existsSync(sessionsPath)` → replace with try-catch around `fs.promises.access`:

```javascript
try {
    await fs.promises.access(sessionsPath);
} catch {
    continue;
}
```

- Line ~394: `fs.readFileSync(sessionsPath, 'utf8')` → `await fs.promises.readFile(sessionsPath, 'utf8')`

- [ ] **Step 2: Update caller to parallelize agents + subagents**

In `buildDashboardPayload()`, update the subagents call (currently line 475) to run in parallel with agent processing. Combine with Task 1's change:

```javascript
const agentList = parseAgentsList(agentsResult.stdout || '');
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

- [ ] **Step 3: Update test for subagent parse failure**

In `tests/dashboardPayloadService.test.js`, the test "warns when subagent sessions json or cron json cannot be parsed" (line 303-340) uses `mockFs.readFileSync` and `mockFs.readdirSync` for subagent paths. Update to use async mocks:

```javascript
mockFs.promises.readdir.mockImplementation((targetPath) => {
    if (targetPath === agentsRoot) return Promise.resolve(['main']);
    if (targetPath === sessionsDir) return Promise.resolve([]);
    return Promise.resolve([]);
});
mockFs.promises.access.mockImplementation((targetPath) => {
    if (targetPath === '/tmp/home/.openclaw/bin/openclaw' ||
        targetPath === sessionsDir ||
        targetPath === sessionsJsonPath) {
        return Promise.resolve();
    }
    return Promise.reject(new Error('ENOENT'));
});
mockFs.promises.readFile.mockImplementation((targetPath) => {
    if (targetPath === sessionsJsonPath) return Promise.resolve('{bad json');
    return Promise.reject(new Error(`unexpected path ${targetPath}`));
});
```

Keep `mockFs.existsSync` for `resolveOpenclawBin` which still uses sync check.

- [ ] **Step 4: Update test for agent activity read failure**

In tests "warns when agent activity cannot be read but still returns the fallback detail" (line 282-301), update the mock to use `fs.promises.readFile` rejection:

```javascript
mockFs.promises.readFile.mockImplementation((targetPath) => {
    if (targetPath.endsWith('sessions.json')) {
        return Promise.reject(new Error('sessions broken'));
    }
    return Promise.resolve('');
});
```

- [ ] **Step 5: Verify no remaining sync calls in converted functions**

Run: `grep -n 'existsSync\|readFileSync\|readdirSync\|statSync' src/backend/services/dashboardPayloadService.js`

Expected: Only `existsSync` in `resolveOpenclawBin` (line ~79). No sync calls in `detectDetailedActivity` or `buildSubagentStatus`.

- [ ] **Step 6: Run full test suite**

Run: `npm test 2>&1 | tail -5`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add src/backend/services/dashboardPayloadService.js tests/dashboardPayloadService.test.js
git commit -m "perf: convert sync I/O to async parallel in dashboard payload

detectDetailedActivity and buildSubagentStatus now use fs.promises
and run in parallel via Promise.all, unblocking the event loop.
17 agents: serial ~2s → parallel ~200ms.

Closes #N"
```

---

## Chunk 2: Tiered Cache

### Task 3: Implement per-source cache

**Files:**
- Modify: `src/backend/services/dashboardPayloadService.js`
- Modify: `tests/dashboardPayloadService.test.js`

- [ ] **Step 1: Write failing test for tiered cache behavior**

Add to `tests/dashboardPayloadService.test.js`:

```javascript
it('serves cached agent data within TTL instead of rebuilding', async () => {
    // First call builds payload
    await service.updateSharedData();
    const firstPayload = service.getSharedPayload();
    expect(firstPayload).toBeTruthy();

    // Record call counts after first build
    const agentsCallCount = mockExecFilePromise.mock.calls
        .filter(c => c[1] && c[1][0] === 'agents').length;

    // Second call within TTL should reuse cache
    await service.updateSharedData();
    const secondPayload = service.getSharedPayload();

    // agents CLI should NOT have been called again (10s TTL)
    const agentsCallCount2 = mockExecFilePromise.mock.calls
        .filter(c => c[1] && c[1][0] === 'agents').length;
    expect(agentsCallCount2).toBe(agentsCallCount);
    expect(secondPayload.agents).toEqual(firstPayload.agents);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --testPathPattern=dashboardPayloadService -t "serves cached agent" 2>&1 | tail -10`
Expected: FAIL (currently no per-source cache, so agents CLI is called every time when dashboardCache 3s TTL expires)

- [ ] **Step 3: Replace single cache with per-source cache**

In `src/backend/services/dashboardPayloadService.js`:

Remove the old cache constants and variables:
```javascript
// REMOVE these:
const DASHBOARD_CACHE_TTL_MS = 3000;
let dashboardCache = { ts: 0, payload: null };
```

Add per-source cache:
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

function updateCache(entry, data) {
    entry.data = data;
    entry.ts = Date.now();
}

function invalidateCache(entry) {
    entry.data = null;
    entry.ts = 0;
}
```

- [ ] **Step 4: Refactor `buildDashboardPayload` to use per-source cache**

**Remove** the old early-return guard on line 436-438 (`if (dashboardCache.payload && now - dashboardCache.ts < DASHBOARD_CACHE_TTL_MS) return dashboardCache.payload`) and the old cache write on line 482 (`dashboardCache = { ts: now, payload }`). These are replaced by per-source `isFresh()` checks.

Rewrite `buildDashboardPayload()` to check each source independently:

```javascript
async function buildDashboardPayload() {
    const ocBin = await resolveOpenclawBin();

    // Only fetch sources that are stale
    const fetches = [];

    if (!isFresh(cache.sys)) {
        fetches.push(
            getSystemResources().then(data => updateCache(cache.sys, data))
        );
    }

    if (!isFresh(cache.agents)) {
        fetches.push(
            execFilePromise(ocBin, ['agents', 'list']).catch(() => ({ stdout: '' }))
                .then(async (agentsResult) => {
                    const agentList = parseAgentsList(agentsResult.stdout || '');
                    const agents = await Promise.all(
                        agentList.map(async (a) => {
                            const activity = await detectDetailedActivity(a.id);
                            return { ...a, ...activity, model: a.model || activity.activeModel, activeModel: activity.activeModel };
                        })
                    );
                    updateCache(cache.agents, agents);
                })
        );
    }

    if (!isFresh(cache.subagents)) {
        fetches.push(
            buildSubagentStatus().then(data => updateCache(cache.subagents, data))
        );
    }

    if (!isFresh(cache.cron)) {
        fetches.push(
            execFilePromise(ocBin, ['cron', 'list', '--json']).catch(() => ({ stdout: '{"jobs":[]}' }))
                .then((cronResult) => {
                    let cronJobs = [];
                    try {
                        const parsedCron = JSON.parse(cronResult.stdout || '{"jobs":[]}');
                        cronJobs = Array.isArray(parsedCron.jobs) ? parsedCron.jobs : [];
                    } catch (e) {
                        logger.warn('cron_jobs_parse_failed', { msg: e.message });
                    }
                    const cron = cronJobs.map((j) => ({
                        id: j.id, name: j.name, enabled: j.enabled !== false,
                        next: j.state?.nextRunAtMs, status: j.state?.lastStatus || 'ok',
                        lastRunAt: j.state?.lastRunAtMs, lastError: j.state?.lastError || '',
                    }));
                    updateCache(cache.cron, cron);
                })
        );
    }

    if (!isFresh(cache.cooldowns)) {
        fetches.push(
            fetchModelCooldowns().then(data => updateCache(cache.cooldowns, data))
        );
    }

    // Version + exchange rate keep their existing caching
    const [openclawVersionResult, exchangeRate] = await Promise.all([
        cachedOcVersion
            ? Promise.resolve({ stdout: cachedOcVersion, stderr: '' })
            : execFilePromise(ocBin, ['--version']).catch(() => ({ stdout: '' })),
        getExchangeRate(),
        ...fetches,
    ]);

    const openclawVersion = parseOpenclawVersionOutput(openclawVersionResult.stdout, openclawVersionResult.stderr);
    if (openclawVersion && !cachedOcVersion) cachedOcVersion = openclawVersion;

    return {
        success: true,
        openclaw: { version: openclawVersion || null },
        sys: cache.sys.data,
        agents: cache.agents.data || [],
        cron: cache.cron.data || [],
        subagents: cache.subagents.data || [],
        cooldowns: cache.cooldowns.data || {},
        exchangeRate,
    };
}
```

- [ ] **Step 5: Update `invalidateSharedPayload` to also invalidate per-source caches**

```javascript
function invalidateSharedPayload() {
    sharedPayload = null;
    lastUpdateTs = 0;
    Object.values(cache).forEach(entry => invalidateCache(entry));
}
```

- [ ] **Step 6: Wire agentWatcher event to invalidate agent caches**

In `startGlobalPolling()`, update the `state_update` handler to invalidate agent-specific caches:

```javascript
agentWatcherService.on('state_update', () => {
    clearTimeout(watcherDebounceTimer);
    watcherDebounceTimer = setTimeout(async () => {
        invalidateCache(cache.agents);
        invalidateCache(cache.subagents);
        await updateSharedData();
        doBroadcast().catch((e) => logger.error('poller_broadcast_error', { msg: e.message }));
    }, 300);
});
```

- [ ] **Step 7: Run tests**

Run: `npm test -- --testPathPattern=dashboardPayloadService 2>&1 | tail -10`
Expected: All tests PASS including the new cache test

- [ ] **Step 8: Run full test suite**

Run: `npm test 2>&1 | tail -5`
Expected: All tests PASS

- [ ] **Step 9: Commit**

```bash
git add src/backend/services/dashboardPayloadService.js tests/dashboardPayloadService.test.js
git commit -m "perf: implement tiered cache for dashboard data sources

Replace single 3s cache with per-source TTLs:
sys 5s, agents/subagents 10s, cooldowns 15s, cron 30s.
agentWatcher events invalidate agent caches immediately.
~70% reduction in CLI calls during steady state.

Closes #N"
```

---

## Chunk 3: TaskHub SQL Consolidation

### Task 4: Optimize `getStats` — 9 queries to 3

**Files:**
- Modify: `src/backend/controllers/taskHubController.js` — `getStats` function
- Test: `tests/taskHub.test.js` (existing tests should pass unchanged)

- [ ] **Step 1: Run existing getStats tests as baseline**

Run: `npm test -- --testPathPattern=taskHub -t "getStats" 2>&1 | tail -10`
Expected: All PASS

- [ ] **Step 2: Refactor `getStats` to derive total/active from GROUP BY**

In `src/backend/controllers/taskHubController.js`, replace the `getStats` function body (line 43-70):

```javascript
async function getStats(req, res) {
    try {
        const conn = getDb();
        const result = { domains: {}, total_active: 0 };
        const INACTIVE_STATUSES = ['done', 'archived', 'cancelled'];

        for (const [domain, table] of Object.entries(DOMAIN_TABLES)) {
            const byStatus = conn.prepare(
                `SELECT status, COUNT(*) as n FROM ${table} GROUP BY status`
            ).all();

            const total = byStatus.reduce((sum, r) => sum + r.n, 0);
            const active = byStatus
                .filter(r => !INACTIVE_STATUSES.includes(r.status))
                .reduce((sum, r) => sum + r.n, 0);

            result.domains[domain] = {
                total,
                active,
                by_status: byStatus.reduce((acc, r) => { acc[r.status] = r.n; return acc; }, {}),
            };
            result.total_active += active;
        }

        return sendOk(res, { stats: result });
    } catch (err) {
        logger.error('taskhub_stats_error', { requestId: req.requestId, details: logger.toErrorFields(err) });
        return sendFail(res, 500, err.message);
    }
}
```

- [ ] **Step 3: Run getStats tests**

Run: `npm test -- --testPathPattern=taskHub -t "getStats" 2>&1 | tail -10`
Expected: All PASS (API response format unchanged)

### Task 5: Optimize `getTasks` — UNION ALL for domain=all

**Files:**
- Modify: `src/backend/controllers/taskHubController.js` — `getTasks` function
- Modify: `tests/taskHub.test.js` — update test schema + add UNION ALL test

- [ ] **Step 1: Update test schema to match production**

In `tests/taskHub.test.js`, the test schemas (line 9-57) are missing columns that exist in production (`parent_id`, `notion_page_id`, `notion_synced_at` in all tables; `automation_level` in sideproject). Update the SCHEMA constant:

```javascript
const SCHEMA = `
    CREATE TABLE IF NOT EXISTS work_tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        status TEXT DEFAULT 'not_started',
        priority TEXT DEFAULT 'medium',
        due_date TEXT,
        completed_at TEXT,
        assignee TEXT,
        project TEXT,
        parent_id TEXT,
        tags TEXT,
        notes TEXT,
        notion_page_id TEXT,
        notion_dirty INTEGER DEFAULT 0,
        notion_synced_at TEXT,
        created_at TEXT,
        updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS personal_tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        status TEXT DEFAULT 'not_started',
        priority TEXT DEFAULT 'medium',
        due_date TEXT,
        completed_at TEXT,
        parent_id TEXT,
        tags TEXT,
        notes TEXT,
        notion_page_id TEXT,
        notion_dirty INTEGER DEFAULT 0,
        notion_synced_at TEXT,
        created_at TEXT,
        updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS sideproject_tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        status TEXT DEFAULT 'not_started',
        priority TEXT DEFAULT 'medium',
        due_date TEXT,
        completed_at TEXT,
        project TEXT,
        parent_id TEXT,
        tags TEXT,
        notes TEXT,
        notion_page_id TEXT,
        notion_dirty INTEGER DEFAULT 0,
        notion_synced_at TEXT,
        github_repo TEXT,
        github_issue_id INTEGER,
        github_pr_id INTEGER,
        github_branch TEXT,
        dev_status TEXT,
        automation_level TEXT DEFAULT 'level_5',
        created_at TEXT,
        updated_at TEXT
    );
`;
```

- [ ] **Step 2: Run all taskHub tests to verify schema update doesn't break anything**

Run: `npm test -- --testPathPattern=taskHub 2>&1 | tail -10`
Expected: All PASS

- [ ] **Step 3: Add column constants to `taskHubController.js`**

At the top of `taskHubController.js`, after `VALID_PRIORITIES`, add:

```javascript
const COMMON_COLS = 'id, title, status, priority, due_date, completed_at, parent_id, tags, notes, notion_page_id, notion_dirty, notion_synced_at, created_at, updated_at';

const DOMAIN_SELECT = {
    work:        `${COMMON_COLS}, assignee, project, NULL as github_repo, NULL as github_issue_id, NULL as github_pr_id, NULL as github_branch, NULL as dev_status, NULL as automation_level`,
    personal:    `${COMMON_COLS}, NULL as assignee, NULL as project, NULL as github_repo, NULL as github_issue_id, NULL as github_pr_id, NULL as github_branch, NULL as dev_status, NULL as automation_level`,
    sideproject: `${COMMON_COLS}, NULL as assignee, project, github_repo, github_issue_id, github_pr_id, github_branch, dev_status, automation_level`,
};

const ORDER_CLAUSE = `ORDER BY
    CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
    CASE status WHEN 'blocked' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'not_started' THEN 2 ELSE 9 END,
    updated_at DESC`;
```

- [ ] **Step 4: Write failing test for UNION ALL path**

Add to `tests/taskHub.test.js` inside the `getTasks` describe:

```javascript
it('returns tasks from all domains with correct domain labels via UNION ALL', async () => {
    const req = { query: { domain: 'all' } };
    const res = mockRes();
    await taskHubController.getTasks(req, res);
    const data = res.json.mock.calls[0][0];
    expect(data.success).toBe(true);
    const domains = [...new Set(data.tasks.map(t => t.domain))];
    expect(domains).toEqual(expect.arrayContaining(['work', 'personal', 'sideproject']));
    // Verify priority ordering is maintained
    const priorities = data.tasks.map(t => t.priority);
    const priMap = { urgent: 0, high: 1, medium: 2, low: 3 };
    for (let i = 1; i < priorities.length; i++) {
        expect(priMap[priorities[i]] ?? 4).toBeGreaterThanOrEqual(priMap[priorities[i-1]] ?? 4);
    }
});

it('sorts draft tasks after not_started in domain=all UNION ALL path', async () => {
    insertTask('work', { title: 'Draft task', priority: 'medium', status: 'draft' });
    insertTask('personal', { title: 'Not started task', priority: 'medium', status: 'not_started' });
    const req = { query: { domain: 'all' } };
    const res = mockRes();
    await taskHubController.getTasks(req, res);
    const data = res.json.mock.calls[0][0];
    const statuses = data.tasks.filter(t => ['draft', 'not_started'].includes(t.status)).map(t => t.status);
    // not_started (mapped to 2) should come before draft (mapped to 9 via ELSE)
    if (statuses.length >= 2) {
        expect(statuses.indexOf('not_started')).toBeLessThan(statuses.indexOf('draft'));
    }
});
```

- [ ] **Step 5: Refactor `getTasks` to use UNION ALL for domain=all**

Replace the `getTasks` function body (line 76-133) in `taskHubController.js`:

```javascript
async function getTasks(req, res) {
    try {
        const conn = getDb();
        const { domain = 'all', status, priority, search, limit = 100, project } = req.query;

        if (domain !== 'all' && !DOMAIN_TABLES[domain]) {
            return sendFail(res, 400, `Invalid domain: ${domain}`);
        }

        const parsedLimit = Math.min(parseInt(limit) || 100, 500);
        const domains = domain === 'all' ? Object.keys(DOMAIN_TABLES) : [domain];

        // Build WHERE clause fragments
        const conditions = [];
        const params = [];
        if (status) { conditions.push('status = ?'); params.push(status); }
        if (priority) { conditions.push('priority = ?'); params.push(priority); }
        if (project) { conditions.push('project = ?'); params.push(project); }
        if (search) {
            conditions.push('(title LIKE ? OR notes LIKE ?)');
            params.push(`%${search}%`, `%${search}%`);
        }
        const whereClause = conditions.length > 0 ? ' AND ' + conditions.join(' AND ') : '';

        let allTasks;

        if (domain === 'all') {
            // UNION ALL across all domains — single query, SQLite handles sort
            const parts = domains.map(d => {
                const table = DOMAIN_TABLES[d];
                return `SELECT ${DOMAIN_SELECT[d]}, '${d}' as domain FROM ${table} WHERE 1=1${whereClause}`;
            });
            // Params must be repeated for each UNION branch
            const allParams = [];
            for (let i = 0; i < domains.length; i++) {
                allParams.push(...params);
            }
            allParams.push(parsedLimit);
            const sql = parts.join(' UNION ALL ') + ` ${ORDER_CLAUSE} LIMIT ?`;
            allTasks = conn.prepare(sql).all(...allParams);
        } else {
            // Single domain — keep original simple query
            const table = DOMAIN_TABLES[domain];
            let sql = `SELECT *, '${domain}' as domain FROM ${table} WHERE 1=1${whereClause}`;
            sql += ` ${ORDER_CLAUSE} LIMIT ?`;
            allTasks = conn.prepare(sql).all(...params, parsedLimit);
        }

        allTasks = allTasks.map(r => ({ ...r, tags: tryParseJson(r.tags, []) }));

        return sendOk(res, { tasks: allTasks, total: allTasks.length });
    } catch (err) {
        logger.error('taskhub_get_tasks_error', { requestId: req.requestId, details: logger.toErrorFields(err) });
        return sendFail(res, 500, err.message);
    }
}
```

Note: The JS-side cross-domain sort is removed — SQLite now handles it via `ORDER_CLAUSE`. The `total` field now reflects the actual returned count (post-LIMIT), which is a minor behavioral change but acceptable per the "no API compatibility constraints" decision. The `draft` status sort position changes from 3 (JS) to 9 (SQL ELSE) — this is intentional as draft tasks should sort after active statuses.

**Important:** Verify the frontend doesn't rely on `total > tasks.length` for pagination. Check `src/frontend/public/js/modules/taskhub.js` for usage of the `total` field before implementing.

- [ ] **Step 6: Run all taskHub tests**

Run: `npm test -- --testPathPattern=taskHub 2>&1 | tail -10`
Expected: All PASS

- [ ] **Step 7: Run full test suite**

Run: `npm test 2>&1 | tail -5`
Expected: All tests PASS

- [ ] **Step 8: Commit**

```bash
git add src/backend/controllers/taskHubController.js tests/taskHub.test.js
git commit -m "perf: consolidate TaskHub SQL queries

getStats: 9 queries → 3 (derive total/active from GROUP BY).
getTasks(domain=all): 3 queries → 1 UNION ALL with SQLite sort.
Single-domain queries unchanged for safety.

Closes #N"
```

---

## Post-Implementation Verification

- [ ] **Final: Run full test suite and verify**

Run: `npm test 2>&1 | tail -10`
Expected: All tests PASS, no regressions

- [ ] **Final: Grep for remaining sync calls**

Run: `grep -n 'existsSync\|readFileSync\|readdirSync\|statSync' src/backend/services/dashboardPayloadService.js`
Expected: Only `existsSync` in `resolveOpenclawBin`

- [ ] **Final: Manual smoke test**

Run: `pkill -f "node server.js" 2>/dev/null; npm start &`
Visit: `https://localhost:3001`
Verify: Dashboard loads, SSE updates work, TaskHub page functions
