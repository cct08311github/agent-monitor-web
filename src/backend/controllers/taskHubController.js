/**
 * TaskHub Controller
 * 整合 task-hub SQLite 資料庫，提供任務查詢與維護 API
 *
 * DB: configurable via TASKHUB_DB_PATH
 * 三個 Domain: work_tasks / personal_tasks / sideproject_tasks
 */

const { getTaskHubConfig } = require('../config');
const { sendOk, sendFail } = require('../utils/apiResponse');
const logger = require('../utils/logger');

const DOMAIN_TABLES = {
    work: 'work_tasks',
    personal: 'personal_tasks',
    sideproject: 'sideproject_tasks',
};

const VALID_STATUSES = ['draft', 'not_started', 'in_progress', 'done', 'archived', 'blocked', 'cancelled'];
const VALID_PRIORITIES = ['low', 'medium', 'high', 'urgent'];

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

let db = null;

function getDb() {
    if (db) return db;
    try {
        const Database = require('better-sqlite3');
        const { dbPath } = getTaskHubConfig();
        db = new Database(dbPath, { readonly: false, fileMustExist: true });
        db.pragma('journal_mode = WAL');
        db.pragma('foreign_keys = ON');
        logger.info('taskhub_db_connected', { dbPath });
        return db;
    } catch (err) {
        logger.error('taskhub_db_connect_error', { details: logger.toErrorFields(err) });
        throw err;
    }
}

// ─────────────────────────────────────────
// GET /api/taskhub/stats
// ─────────────────────────────────────────
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

// ─────────────────────────────────────────
// GET /api/taskhub/tasks?domain=&status=&priority=&search=&limit=
// domain: work | personal | sideproject | all (default: all)
// ─────────────────────────────────────────
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
            // Wrap UNION ALL in subquery so ORDER BY can use expressions
            const sql = `SELECT * FROM (${parts.join(' UNION ALL ')}) ${ORDER_CLAUSE} LIMIT ?`;
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

// ─────────────────────────────────────────
// PATCH /api/taskhub/tasks/:domain/:id
// Body: { status, priority, notes, title, due_date, assignee, project, tags,
//         github_repo, github_issue_id, github_pr_id, github_branch, dev_status }
// ─────────────────────────────────────────
async function updateTask(req, res) {
    const { domain, id } = req.params;
    if (!DOMAIN_TABLES[domain]) {
        return sendFail(res, 400, `Invalid domain: ${domain}`);
    }

    try {
        const conn = getDb();
        const table = DOMAIN_TABLES[domain];
        const {
            status, priority, notes, title, due_date, assignee, project, tags,
            github_repo, github_issue_id, github_pr_id, github_branch, dev_status,
        } = req.body;

        // Validate
        if (status && !VALID_STATUSES.includes(status)) {
            return sendFail(res, 400, `Invalid status: ${status}`);
        }
        if (priority && !VALID_PRIORITIES.includes(priority)) {
            return sendFail(res, 400, `Invalid priority: ${priority}`);
        }

        const updates = [];
        const values = [];

        if (status    !== undefined) { updates.push('status = ?');   values.push(status); }
        if (priority  !== undefined) { updates.push('priority = ?'); values.push(priority); }
        if (notes     !== undefined) { updates.push('notes = ?');    values.push(notes || null); }
        if (title     !== undefined) { updates.push('title = ?');    values.push(title.trim()); }
        if (due_date  !== undefined) { updates.push('due_date = ?'); values.push(due_date || null); }
        if (tags      !== undefined) { updates.push('tags = ?');     values.push(Array.isArray(tags) ? JSON.stringify(tags) : (tags || null)); }

        // work / sideproject only
        if (domain !== 'personal' && project !== undefined) { updates.push('project = ?'); values.push(project || null); }
        // work only
        if (domain === 'work' && assignee !== undefined) { updates.push('assignee = ?'); values.push(assignee || null); }
        // sideproject only
        if (domain === 'sideproject') {
            if (github_repo      !== undefined) { updates.push('github_repo = ?');      values.push(github_repo || null); }
            if (github_issue_id  !== undefined) { updates.push('github_issue_id = ?');  values.push(github_issue_id ? parseInt(github_issue_id, 10) : null); }
            if (github_pr_id     !== undefined) { updates.push('github_pr_id = ?');     values.push(github_pr_id ? parseInt(github_pr_id, 10) : null); }
            if (github_branch    !== undefined) { updates.push('github_branch = ?');    values.push(github_branch || null); }
            if (dev_status       !== undefined) { updates.push('dev_status = ?');       values.push(dev_status || null); }
        }

        if (status === 'done') {
            updates.push('completed_at = ?');
            values.push(new Date().toISOString().split('.')[0] + 'Z');
        }
        if (status && status !== 'done') {
            updates.push('completed_at = ?');
            values.push(null);
        }

        if (updates.length === 0) {
            return sendFail(res, 400, 'No fields to update');
        }

        updates.push('updated_at = ?');
        values.push(new Date().toISOString().split('.')[0] + 'Z');
        updates.push('notion_dirty = 1');

        values.push(id);
        const stmt = conn.prepare(`UPDATE ${table} SET ${updates.join(', ')} WHERE id = ?`);
        const info = stmt.run(...values);

        if (info.changes === 0) {
            return sendFail(res, 404, '找不到任務');
        }

        const updated = conn.prepare(`SELECT *, '${domain}' as domain FROM ${table} WHERE id = ?`).get(id);
        return sendOk(res, { task: { ...updated, tags: tryParseJson(updated.tags, []) } });
    } catch (err) {
        logger.error('taskhub_update_task_error', { requestId: req.requestId, details: logger.toErrorFields(err) });
        return sendFail(res, 500, err.message);
    }
}

// ─────────────────────────────────────────
// DELETE /api/taskhub/tasks/:domain/:id
// ─────────────────────────────────────────
async function deleteTask(req, res) {
    const { domain, id } = req.params;
    if (!DOMAIN_TABLES[domain]) {
        return sendFail(res, 400, `Invalid domain: ${domain}`);
    }
    try {
        const conn = getDb();
        const table = DOMAIN_TABLES[domain];
        const existing = conn.prepare(`SELECT id, title FROM ${table} WHERE id = ?`).get(id);
        if (!existing) return sendFail(res, 404, '找不到任務');

        conn.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
        logger.info('taskhub_task_deleted', { requestId: req.requestId, id, title: existing.title, domain });
        return sendOk(res, { deleted: { id, title: existing.title, domain } });
    } catch (err) {
        logger.error('taskhub_delete_task_error', { requestId: req.requestId, details: logger.toErrorFields(err) });
        return sendFail(res, 500, err.message);
    }
}

// ─────────────────────────────────────────
// POST /api/taskhub/tasks
// Body: { domain, title, status, priority, due_date, notes, project, tags }
// ─────────────────────────────────────────
async function createTask(req, res) {
    const { domain, title, status = 'not_started', priority = 'medium', due_date, notes, project, tags } = req.body;

    if (!DOMAIN_TABLES[domain]) {
        return sendFail(res, 400, `Invalid domain: ${domain}`);
    }
    if (!title || !title.trim()) {
        return sendFail(res, 400, '標題不可空白');
    }

    try {
        const conn = getDb();
        const table = DOMAIN_TABLES[domain];
        const { v4: uuidv4 } = require('crypto');
        const id = require('crypto').randomUUID();
        const now = new Date().toISOString().replace('T', 'T').split('.')[0] + 'Z';

        const fields = {
            id, title: title.trim(), status, priority,
            due_date: due_date || null,
            notes: notes || null,
            tags: tags ? JSON.stringify(tags) : null,
            notion_dirty: 1,
            created_at: now,
            updated_at: now,
        };

        if (domain === 'work' || domain === 'sideproject') {
            fields.project = project || null;
        }

        const cols = Object.keys(fields).join(', ');
        const placeholders = Object.keys(fields).map(() => '?').join(', ');
        conn.prepare(`INSERT INTO ${table} (${cols}) VALUES (${placeholders})`).run(...Object.values(fields));

        const created = conn.prepare(`SELECT *, '${domain}' as domain FROM ${table} WHERE id = ?`).get(id);
        return sendOk(res, { task: { ...created, tags: tryParseJson(created.tags, []) } }, 201);
    } catch (err) {
        logger.error('taskhub_create_task_error', { requestId: req.requestId, details: logger.toErrorFields(err) });
        return sendFail(res, 500, err.message);
    }
}

// ─────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────
function tryParseJson(str, fallback) {
    if (!str) return fallback;
    try { return JSON.parse(str); } catch { return fallback; }
}

module.exports = { getStats, getTasks, updateTask, createTask, deleteTask };
