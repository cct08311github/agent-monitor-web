/**
 * TaskHub Controller
 * 整合 task-hub SQLite 資料庫，提供任務查詢與維護 API
 *
 * DB: configurable via TASKHUB_DB_PATH
 * 三個 Domain: work_tasks / personal_tasks / sideproject_tasks
 */

const { getTaskHubConfig } = require('../config');

const DOMAIN_TABLES = {
    work: 'work_tasks',
    personal: 'personal_tasks',
    sideproject: 'sideproject_tasks',
};

const VALID_STATUSES = ['draft', 'not_started', 'in_progress', 'done', 'archived', 'blocked', 'cancelled'];
const VALID_PRIORITIES = ['low', 'medium', 'high', 'urgent'];

let db = null;

function getDb() {
    if (db) return db;
    try {
        const Database = require('better-sqlite3');
        const { dbPath } = getTaskHubConfig();
        db = new Database(dbPath, { readonly: false, fileMustExist: true });
        db.pragma('journal_mode = WAL');
        db.pragma('foreign_keys = ON');
        console.log('[TaskHub] DB connected:', dbPath);
        return db;
    } catch (err) {
        console.error('[TaskHub] DB connect failed:', err.message);
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

        for (const [domain, table] of Object.entries(DOMAIN_TABLES)) {
            const total = conn.prepare(`SELECT COUNT(*) as n FROM ${table}`).get().n;
            const active = conn.prepare(
                `SELECT COUNT(*) as n FROM ${table} WHERE status NOT IN ('done','archived','cancelled')`
            ).get().n;
            const byStatus = conn.prepare(
                `SELECT status, COUNT(*) as n FROM ${table} GROUP BY status`
            ).all();

            result.domains[domain] = {
                total,
                active,
                by_status: byStatus.reduce((acc, r) => { acc[r.status] = r.n; return acc; }, {}),
            };
            result.total_active += active;
        }

        res.json({ success: true, stats: result });
    } catch (err) {
        console.error('[TaskHub] getStats error:', err.message);
        res.status(500).json({ success: false, error: err.message });
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

        const domains = domain === 'all' ? Object.keys(DOMAIN_TABLES) : [domain];
        if (domain !== 'all' && !DOMAIN_TABLES[domain]) {
            return res.status(400).json({ success: false, error: `Invalid domain: ${domain}` });
        }

        let allTasks = [];

        for (const d of domains) {
            const table = DOMAIN_TABLES[d];
            let sql = `SELECT *, '${d}' as domain FROM ${table} WHERE 1=1`;
            const params = [];

            if (status) { sql += ' AND status = ?'; params.push(status); }
            if (priority) { sql += ' AND priority = ?'; params.push(priority); }
            if (project) { sql += ' AND project = ?'; params.push(project); }
            if (search) {
                sql += ' AND (title LIKE ? OR notes LIKE ?)';
                params.push(`%${search}%`, `%${search}%`);
            }

            sql += ` ORDER BY 
                CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
                CASE status WHEN 'blocked' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'not_started' THEN 2 ELSE 9 END,
                updated_at DESC
                LIMIT ${Math.min(parseInt(limit) || 100, 500)}`;

            const rows = conn.prepare(sql).all(...params);
            allTasks = allTasks.concat(rows.map(r => ({
                ...r,
                tags: tryParseJson(r.tags, []),
            })));
        }

        // Cross-domain sort: urgent/high first
        allTasks.sort((a, b) => {
            const priMap = { urgent: 0, high: 1, medium: 2, low: 3 };
            const sMap = { blocked: 0, in_progress: 1, not_started: 2, draft: 3, done: 9, archived: 10, cancelled: 11 };
            /* istanbul ignore next */
            const pa = priMap[a.priority] ?? 4, pb = priMap[b.priority] ?? 4;
            if (pa !== pb) return pa - pb;
            /* istanbul ignore next */
            const sa = sMap[a.status] ?? 5, sb = sMap[b.status] ?? 5;
            if (sa !== sb) return sa - sb;
            /* istanbul ignore next */
            return (b.updated_at || '').localeCompare(a.updated_at || '');
        });

        res.json({ success: true, tasks: allTasks.slice(0, parseInt(limit) || 100), total: allTasks.length });
    } catch (err) {
        console.error('[TaskHub] getTasks error:', err.message);
        res.status(500).json({ success: false, error: err.message });
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
        return res.status(400).json({ success: false, error: `Invalid domain: ${domain}` });
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
            return res.status(400).json({ success: false, error: `Invalid status: ${status}` });
        }
        if (priority && !VALID_PRIORITIES.includes(priority)) {
            return res.status(400).json({ success: false, error: `Invalid priority: ${priority}` });
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
            return res.status(400).json({ success: false, error: 'No fields to update' });
        }

        updates.push('updated_at = ?');
        values.push(new Date().toISOString().split('.')[0] + 'Z');
        updates.push('notion_dirty = 1');

        values.push(id);
        const stmt = conn.prepare(`UPDATE ${table} SET ${updates.join(', ')} WHERE id = ?`);
        const info = stmt.run(...values);

        if (info.changes === 0) {
            return res.status(404).json({ success: false, error: '找不到任務' });
        }

        const updated = conn.prepare(`SELECT *, '${domain}' as domain FROM ${table} WHERE id = ?`).get(id);
        res.json({ success: true, task: { ...updated, tags: tryParseJson(updated.tags, []) } });
    } catch (err) {
        console.error('[TaskHub] updateTask error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
}

// ─────────────────────────────────────────
// DELETE /api/taskhub/tasks/:domain/:id
// ─────────────────────────────────────────
async function deleteTask(req, res) {
    const { domain, id } = req.params;
    if (!DOMAIN_TABLES[domain]) {
        return res.status(400).json({ success: false, error: `Invalid domain: ${domain}` });
    }
    try {
        const conn = getDb();
        const table = DOMAIN_TABLES[domain];
        const existing = conn.prepare(`SELECT id, title FROM ${table} WHERE id = ?`).get(id);
        if (!existing) return res.status(404).json({ success: false, error: '找不到任務' });

        conn.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
        console.log(`[TaskHub] Deleted task ${id} (${existing.title}) from ${domain}`);
        res.json({ success: true, deleted: { id, title: existing.title, domain } });
    } catch (err) {
        console.error('[TaskHub] deleteTask error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
}

// ─────────────────────────────────────────
// POST /api/taskhub/tasks
// Body: { domain, title, status, priority, due_date, notes, project, tags }
// ─────────────────────────────────────────
async function createTask(req, res) {
    const { domain, title, status = 'not_started', priority = 'medium', due_date, notes, project, tags } = req.body;

    if (!DOMAIN_TABLES[domain]) {
        return res.status(400).json({ success: false, error: `Invalid domain: ${domain}` });
    }
    if (!title || !title.trim()) {
        return res.status(400).json({ success: false, error: '標題不可空白' });
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
        res.status(201).json({ success: true, task: { ...created, tags: tryParseJson(created.tags, []) } });
    } catch (err) {
        console.error('[TaskHub] createTask error:', err.message);
        res.status(500).json({ success: false, error: err.message });
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
