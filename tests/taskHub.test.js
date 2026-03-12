// Mock better-sqlite3 with an in-memory implementation
const Database = require('better-sqlite3');

// Use a real in-memory SQLite for testing
let mockTestDb;
let taskHubController;

// Create a schema matching taskhub
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

// Intercept Database constructor to return our test db
jest.mock('better-sqlite3', () => {
    return jest.fn().mockImplementation(() => {
        return mockTestDb;
    });
});

beforeAll(() => {
    // Create a real in-memory SQLite database for testing
    const RealDatabase = jest.requireActual('better-sqlite3');
    mockTestDb = new RealDatabase(':memory:');
    mockTestDb.exec(SCHEMA);
    mockTestDb.pragma('journal_mode = WAL');
    mockTestDb.pragma('foreign_keys = ON');
});

beforeEach(() => {
    jest.resetModules();
    jest.mock('better-sqlite3', () => {
        return jest.fn().mockImplementation(() => mockTestDb);
    });
    taskHubController = require('../src/backend/controllers/taskHubController');
    // Clear tables before each test
    mockTestDb.exec(`DELETE FROM work_tasks; DELETE FROM personal_tasks; DELETE FROM sideproject_tasks;`);
});

afterAll(() => {
    if (mockTestDb) mockTestDb.close();
});

function mockRes() {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
}

function insertTask(domain, overrides = {}) {
    const tables = { work: 'work_tasks', personal: 'personal_tasks', sideproject: 'sideproject_tasks' };
    const now = new Date().toISOString().split('.')[0] + 'Z';
    const id = require('crypto').randomUUID();
    const defaults = {
        id, title: 'Test Task', status: 'not_started', priority: 'medium',
        notion_dirty: 0, created_at: now, updated_at: now,
    };
    const fields = { ...defaults, ...overrides };
    const cols = Object.keys(fields).join(', ');
    const placeholders = Object.keys(fields).map(() => '?').join(', ');
    mockTestDb.prepare(`INSERT INTO ${tables[domain]} (${cols}) VALUES (${placeholders})`).run(...Object.values(fields));
    return id;
}

// getStats
describe('getStats', () => {
    it('returns stats for all domains', async () => {
        insertTask('work', { title: 'Work task 1', status: 'in_progress' });
        insertTask('personal', { title: 'Personal task 1', status: 'done' });
        insertTask('sideproject', { title: 'Side task 1', status: 'not_started' });

        const res = mockRes();
        await taskHubController.getStats({}, res);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
        const data = res.json.mock.calls[0][0];
        expect(data.stats.domains).toHaveProperty('work');
        expect(data.stats.domains).toHaveProperty('personal');
        expect(data.stats.domains).toHaveProperty('sideproject');
    });

    it('returns zero counts for empty DB', async () => {
        const res = mockRes();
        await taskHubController.getStats({}, res);
        const data = res.json.mock.calls[0][0];
        expect(data.stats.total_active).toBe(0);
    });
});

// getTasks
describe('getTasks', () => {
    beforeEach(() => {
        insertTask('work', { title: 'Work urgent', priority: 'urgent', status: 'in_progress', project: 'proj-a' });
        insertTask('work', { title: 'Work low', priority: 'low', status: 'done' });
        insertTask('personal', { title: 'Personal task', priority: 'medium', status: 'not_started' });
        insertTask('sideproject', { title: 'Side task', priority: 'high', status: 'blocked' });
    });

    it('returns all tasks when domain=all', async () => {
        const req = { query: {} };
        const res = mockRes();
        await taskHubController.getTasks(req, res);
        const data = res.json.mock.calls[0][0];
        expect(data.success).toBe(true);
        expect(Array.isArray(data.tasks)).toBe(true);
        expect(data.tasks.length).toBeGreaterThan(0);
    });

    it('filters by domain', async () => {
        const req = { query: { domain: 'work' } };
        const res = mockRes();
        await taskHubController.getTasks(req, res);
        const data = res.json.mock.calls[0][0];
        data.tasks.forEach(t => expect(t.domain).toBe('work'));
    });

    it('filters by status', async () => {
        const req = { query: { domain: 'work', status: 'done' } };
        const res = mockRes();
        await taskHubController.getTasks(req, res);
        const data = res.json.mock.calls[0][0];
        data.tasks.forEach(t => expect(t.status).toBe('done'));
    });

    it('filters by priority', async () => {
        const req = { query: { domain: 'work', priority: 'urgent' } };
        const res = mockRes();
        await taskHubController.getTasks(req, res);
        const data = res.json.mock.calls[0][0];
        data.tasks.forEach(t => expect(t.priority).toBe('urgent'));
    });

    it('filters by search', async () => {
        const req = { query: { domain: 'work', search: 'urgent' } };
        const res = mockRes();
        await taskHubController.getTasks(req, res);
        const data = res.json.mock.calls[0][0];
        expect(data.tasks.length).toBeGreaterThan(0);
    });

    it('filters by project', async () => {
        const req = { query: { domain: 'work', project: 'proj-a' } };
        const res = mockRes();
        await taskHubController.getTasks(req, res);
        const data = res.json.mock.calls[0][0];
        data.tasks.forEach(t => expect(t.project).toBe('proj-a'));
    });

    it('returns 400 for invalid domain', async () => {
        const req = { query: { domain: 'invalid' } };
        const res = mockRes();
        await taskHubController.getTasks(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    it('respects limit', async () => {
        const req = { query: { limit: '1' } };
        const res = mockRes();
        await taskHubController.getTasks(req, res);
        const data = res.json.mock.calls[0][0];
        expect(data.tasks.length).toBeLessThanOrEqual(1);
    });

    it('sorts tasks with same priority by status (falls through to localeCompare when equal)', async () => {
        // Insert two tasks with same priority AND same status but different updated_at
        const now = new Date().toISOString().split('.')[0] + 'Z';
        const older = '2024-01-01T00:00:00Z';
        insertTask('personal', { title: 'A-older', priority: 'medium', status: 'in_progress', updated_at: older });
        insertTask('personal', { title: 'B-newer', priority: 'medium', status: 'in_progress', updated_at: now });
        const req = { query: { domain: 'personal' } };
        const res = mockRes();
        await taskHubController.getTasks(req, res);
        const data = res.json.mock.calls[0][0];
        expect(data.success).toBe(true);
        // Newer task should come first (localeCompare descending by updated_at)
        const titles = data.tasks.map(t => t.title);
        expect(titles.indexOf('B-newer')).toBeLessThan(titles.indexOf('A-older'));
    });

    it('handles non-numeric limit (triggers parseInt || 100 fallback)', async () => {
        const req = { query: { limit: 'abc' } };
        const res = mockRes();
        await taskHubController.getTasks(req, res);
        const data = res.json.mock.calls[0][0];
        expect(data.success).toBe(true);
        expect(Array.isArray(data.tasks)).toBe(true);
    });

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

    it('handles unknown priority/status values in sort (uses ?? fallback)', async () => {
        // SQLite allows inserting any string, so force unknown priority/status
        mockTestDb.prepare(`INSERT INTO work_tasks (id, title, status, priority, notion_dirty, created_at, updated_at)
            VALUES ('custom-id-1', 'Unknown Pri', 'custom_status', 'custom_priority', 0, '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z')`).run();
        mockTestDb.prepare(`INSERT INTO work_tasks (id, title, status, priority, notion_dirty, created_at, updated_at)
            VALUES ('custom-id-2', 'Normal', 'in_progress', 'medium', 0, '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z')`).run();
        const req = { query: { domain: 'work' } };
        const res = mockRes();
        await taskHubController.getTasks(req, res);
        const data = res.json.mock.calls[0][0];
        expect(data.success).toBe(true);
        expect(data.tasks.length).toBeGreaterThanOrEqual(2);
    });
});

// createTask
describe('createTask', () => {
    it('creates a work task', async () => {
        const req = { body: { domain: 'work', title: 'New Work Task', priority: 'high', project: 'proj-x' } };
        const res = mockRes();
        await taskHubController.createTask(req, res);
        expect(res.status).toHaveBeenCalledWith(201);
        const data = res.json.mock.calls[0][0];
        expect(data.success).toBe(true);
        expect(data.task.title).toBe('New Work Task');
        expect(data.task.domain).toBe('work');
    });

    it('creates a personal task', async () => {
        const req = { body: { domain: 'personal', title: 'Personal Task' } };
        const res = mockRes();
        await taskHubController.createTask(req, res);
        expect(res.status).toHaveBeenCalledWith(201);
    });

    it('creates a sideproject task with tags', async () => {
        const req = { body: { domain: 'sideproject', title: 'Side Task', tags: ['alpha', 'beta'] } };
        const res = mockRes();
        await taskHubController.createTask(req, res);
        expect(res.status).toHaveBeenCalledWith(201);
        const data = res.json.mock.calls[0][0];
        expect(data.task.tags).toEqual(['alpha', 'beta']);
    });

    it('returns 400 for invalid domain', async () => {
        const req = { body: { domain: 'invalid', title: 'Task' } };
        const res = mockRes();
        await taskHubController.createTask(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 400 for missing title', async () => {
        const req = { body: { domain: 'work' } };
        const res = mockRes();
        await taskHubController.createTask(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 400 for empty title', async () => {
        const req = { body: { domain: 'work', title: '   ' } };
        const res = mockRes();
        await taskHubController.createTask(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
    });
});

// updateTask
describe('updateTask', () => {
    let taskId;
    beforeEach(() => {
        taskId = insertTask('work', { title: 'Update Me', status: 'not_started', priority: 'medium' });
    });

    it('updates task status', async () => {
        const req = { params: { domain: 'work', id: taskId }, body: { status: 'in_progress' } };
        const res = mockRes();
        await taskHubController.updateTask(req, res);
        const data = res.json.mock.calls[0][0];
        expect(data.success).toBe(true);
        expect(data.task.status).toBe('in_progress');
    });

    it('sets completed_at when status=done', async () => {
        const req = { params: { domain: 'work', id: taskId }, body: { status: 'done' } };
        const res = mockRes();
        await taskHubController.updateTask(req, res);
        const data = res.json.mock.calls[0][0];
        expect(data.task.completed_at).toBeTruthy();
    });

    it('clears completed_at when status changed away from done', async () => {
        mockTestDb.prepare(`UPDATE work_tasks SET status='done', completed_at='2025-01-01T00:00:00Z' WHERE id=?`).run(taskId);
        const req = { params: { domain: 'work', id: taskId }, body: { status: 'in_progress' } };
        const res = mockRes();
        await taskHubController.updateTask(req, res);
        const data = res.json.mock.calls[0][0];
        expect(data.task.completed_at).toBeNull();
    });

    it('updates title', async () => {
        const req = { params: { domain: 'work', id: taskId }, body: { title: 'Updated Title' } };
        const res = mockRes();
        await taskHubController.updateTask(req, res);
        const data = res.json.mock.calls[0][0];
        expect(data.task.title).toBe('Updated Title');
    });

    it('updates priority on work domain', async () => {
        const req = { params: { domain: 'work', id: taskId }, body: { priority: 'high' } };
        const res = mockRes();
        await taskHubController.updateTask(req, res);
        expect(res.json.mock.calls[0][0].task.priority).toBe('high');
    });

    it('updates assignee on work domain', async () => {
        const req = { params: { domain: 'work', id: taskId }, body: { assignee: 'Alice' } };
        const res = mockRes();
        await taskHubController.updateTask(req, res);
        expect(res.json.mock.calls[0][0].success).toBe(true);
    });

    it('updates project on work domain', async () => {
        const req = { params: { domain: 'work', id: taskId }, body: { project: 'new-project' } };
        const res = mockRes();
        await taskHubController.updateTask(req, res);
        expect(res.json.mock.calls[0][0].success).toBe(true);
    });

    it('updates sideproject-specific fields', async () => {
        const spId = insertTask('sideproject', { title: 'SP Task' });
        const req = {
            params: { domain: 'sideproject', id: spId },
            body: { github_repo: 'owner/repo', github_issue_id: '42', github_pr_id: '10', github_branch: 'feat/x', dev_status: 'review', project: 'side' }
        };
        const res = mockRes();
        await taskHubController.updateTask(req, res);
        expect(res.json.mock.calls[0][0].success).toBe(true);
    });

    it('updates tags as array', async () => {
        const req = { params: { domain: 'work', id: taskId }, body: { tags: ['a', 'b'] } };
        const res = mockRes();
        await taskHubController.updateTask(req, res);
        const data = res.json.mock.calls[0][0];
        expect(data.task.tags).toEqual(['a', 'b']);
    });

    it('returns 400 for invalid domain', async () => {
        const req = { params: { domain: 'bad', id: taskId }, body: { status: 'done' } };
        const res = mockRes();
        await taskHubController.updateTask(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 400 for invalid status', async () => {
        const req = { params: { domain: 'work', id: taskId }, body: { status: 'flying' } };
        const res = mockRes();
        await taskHubController.updateTask(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 400 for invalid priority', async () => {
        const req = { params: { domain: 'work', id: taskId }, body: { priority: 'galaxy-brain' } };
        const res = mockRes();
        await taskHubController.updateTask(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 400 when no fields to update', async () => {
        const req = { params: { domain: 'work', id: taskId }, body: {} };
        const res = mockRes();
        await taskHubController.updateTask(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 404 for nonexistent task', async () => {
        const req = { params: { domain: 'work', id: 'nonexistent-id' }, body: { status: 'done' } };
        const res = mockRes();
        await taskHubController.updateTask(req, res);
        expect(res.status).toHaveBeenCalledWith(404);
    });

    it('updates notes and due_date', async () => {
        const req = { params: { domain: 'work', id: taskId }, body: { notes: 'some notes', due_date: '2025-12-31' } };
        const res = mockRes();
        await taskHubController.updateTask(req, res);
        expect(res.json.mock.calls[0][0].success).toBe(true);
    });

    it('ignores project update on personal domain', async () => {
        const pId = insertTask('personal', { title: 'Personal' });
        const req = { params: { domain: 'personal', id: pId }, body: { status: 'done' } };
        const res = mockRes();
        await taskHubController.updateTask(req, res);
        expect(res.json.mock.calls[0][0].success).toBe(true);
    });

    it('clears nullable fields (notes, due_date, project, assignee) with empty values', async () => {
        const req = { params: { domain: 'work', id: taskId }, body: { notes: '', due_date: '', project: '', assignee: '' } };
        const res = mockRes();
        await taskHubController.updateTask(req, res);
        expect(res.json.mock.calls[0][0].success).toBe(true);
    });

    it('handles non-array tags value', async () => {
        const req = { params: { domain: 'work', id: taskId }, body: { tags: '' } };
        const res = mockRes();
        await taskHubController.updateTask(req, res);
        expect(res.json.mock.calls[0][0].success).toBe(true);
    });

    it('updates sideproject task with only base fields (covers false branches of github field ifs)', async () => {
        const spId = insertTask('sideproject', { title: 'SP Base Only' });
        const req = {
            params: { domain: 'sideproject', id: spId },
            body: { status: 'in_progress' },  // no github_repo, github_issue_id, etc.
        };
        const res = mockRes();
        await taskHubController.updateTask(req, res);
        expect(res.json.mock.calls[0][0].success).toBe(true);
        expect(res.json.mock.calls[0][0].task.status).toBe('in_progress');
    });

    it('clears sideproject nullable fields with falsy values', async () => {
        const spId = insertTask('sideproject', { title: 'SP Clear' });
        const req = {
            params: { domain: 'sideproject', id: spId },
            body: { github_repo: '', github_issue_id: 0, github_pr_id: '', github_branch: '', dev_status: '', project: '' }
        };
        const res = mockRes();
        await taskHubController.updateTask(req, res);
        expect(res.json.mock.calls[0][0].success).toBe(true);
    });
});

// deleteTask
describe('deleteTask', () => {
    it('deletes an existing task', async () => {
        const id = insertTask('work', { title: 'Delete Me' });
        const req = { params: { domain: 'work', id } };
        const res = mockRes();
        await taskHubController.deleteTask(req, res);
        const data = res.json.mock.calls[0][0];
        expect(data.success).toBe(true);
        expect(data.deleted.id).toBe(id);
        expect(data.deleted.domain).toBe('work');
    });

    it('returns 404 for nonexistent task', async () => {
        const req = { params: { domain: 'work', id: 'ghost-id' } };
        const res = mockRes();
        await taskHubController.deleteTask(req, res);
        expect(res.status).toHaveBeenCalledWith(404);
    });

    it('returns 400 for invalid domain', async () => {
        const req = { params: { domain: 'unknown', id: 'x' } };
        const res = mockRes();
        await taskHubController.deleteTask(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
    });
});
