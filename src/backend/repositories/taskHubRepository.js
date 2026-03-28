'use strict';

const { getTaskHubConfig } = require('../config');
const logger = require('../utils/logger');

const DOMAIN_TABLES = {
    work: 'work_tasks',
    personal: 'personal_tasks',
    sideproject: 'sideproject_tasks',
};

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

const INACTIVE_STATUSES = ['done', 'archived', 'cancelled'];
const DOMAINS_WITH_PROJECT = ['work', 'sideproject'];

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

function isValidDomain(domain) {
    return domain in DOMAIN_TABLES;
}

function getTableName(domain) {
    return DOMAIN_TABLES[domain];
}

function getAllDomains() {
    return Object.keys(DOMAIN_TABLES);
}

function getStatsByDomain() {
    const conn = getDb();
    const result = { domains: {}, total_active: 0 };

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

    return result;
}

function findTasks({ domain = 'all', status, priority, search, limit = 100, project }) {
    const conn = getDb();
    const parsedLimit = Math.min(parseInt(limit) || 100, 500);
    const domains = domain === 'all' ? getAllDomains() : [domain];

    const conditions = [];
    const params = [];
    if (status) { conditions.push('status = ?'); params.push(status); }
    if (priority) { conditions.push('priority = ?'); params.push(priority); }
    if (search) {
        conditions.push('(title LIKE ? OR notes LIKE ?)');
        params.push(`%${search}%`, `%${search}%`);
    }
    const whereClause = conditions.length > 0 ? ' AND ' + conditions.join(' AND ') : '';

    if (domain === 'all') {
        const effectiveDomains = project ? domains.filter(d => DOMAINS_WITH_PROJECT.includes(d)) : domains;

        if (effectiveDomains.length === 0) return [];

        const projectClause = project ? ' AND project = ?' : '';
        const parts = effectiveDomains.map(d => {
            const table = DOMAIN_TABLES[d];
            return `SELECT ${DOMAIN_SELECT[d]}, '${d}' as domain FROM ${table} WHERE 1=1${whereClause}${projectClause}`;
        });
        const allParams = [];
        for (const d of effectiveDomains) {
            allParams.push(...params);
            if (project) allParams.push(project);
        }
        allParams.push(parsedLimit);
        const sql = `SELECT * FROM (${parts.join(' UNION ALL ')}) ${ORDER_CLAUSE} LIMIT ?`;
        return conn.prepare(sql).all(...allParams);
    }

    // Single domain
    const table = DOMAIN_TABLES[domain];
    const singleParams = [...params];
    let singleWhere = whereClause;
    if (project && DOMAINS_WITH_PROJECT.includes(domain)) {
        singleWhere += ' AND project = ?';
        singleParams.push(project);
    }
    let sql = `SELECT *, '${domain}' as domain FROM ${table} WHERE 1=1${singleWhere}`;
    sql += ` ${ORDER_CLAUSE} LIMIT ?`;
    return conn.prepare(sql).all(...singleParams, parsedLimit);
}

function updateTask(domain, id, fields) {
    const conn = getDb();
    const table = DOMAIN_TABLES[domain];

    const updates = [];
    const values = [];

    if (fields.status    !== undefined) { updates.push('status = ?');   values.push(fields.status); }
    if (fields.priority  !== undefined) { updates.push('priority = ?'); values.push(fields.priority); }
    if (fields.notes     !== undefined) { updates.push('notes = ?');    values.push(fields.notes || null); }
    if (fields.title     !== undefined) { updates.push('title = ?');    values.push(fields.title.trim()); }
    if (fields.due_date  !== undefined) { updates.push('due_date = ?'); values.push(fields.due_date || null); }
    if (fields.tags      !== undefined) { updates.push('tags = ?');     values.push(Array.isArray(fields.tags) ? JSON.stringify(fields.tags) : (fields.tags || null)); }

    if (domain !== 'personal' && fields.project !== undefined) { updates.push('project = ?'); values.push(fields.project || null); }
    if (domain === 'work' && fields.assignee !== undefined) { updates.push('assignee = ?'); values.push(fields.assignee || null); }
    if (domain === 'sideproject') {
        if (fields.github_repo      !== undefined) { updates.push('github_repo = ?');      values.push(fields.github_repo || null); }
        if (fields.github_issue_id  !== undefined) { updates.push('github_issue_id = ?');  values.push(fields.github_issue_id ? parseInt(fields.github_issue_id, 10) : null); }
        if (fields.github_pr_id     !== undefined) { updates.push('github_pr_id = ?');     values.push(fields.github_pr_id ? parseInt(fields.github_pr_id, 10) : null); }
        if (fields.github_branch    !== undefined) { updates.push('github_branch = ?');    values.push(fields.github_branch || null); }
        if (fields.dev_status       !== undefined) { updates.push('dev_status = ?');       values.push(fields.dev_status || null); }
    }

    if (fields.status === 'done') {
        updates.push('completed_at = ?');
        values.push(new Date().toISOString().split('.')[0] + 'Z');
    }
    if (fields.status && fields.status !== 'done') {
        updates.push('completed_at = ?');
        values.push(null);
    }

    if (updates.length === 0) return { changes: 0, noFields: true };

    updates.push('updated_at = ?');
    values.push(new Date().toISOString().split('.')[0] + 'Z');
    updates.push('notion_dirty = 1');

    values.push(id);
    const info = conn.prepare(`UPDATE ${table} SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    if (info.changes === 0) return { changes: 0, notFound: true };

    const updated = conn.prepare(`SELECT *, '${domain}' as domain FROM ${table} WHERE id = ?`).get(id);
    return { changes: info.changes, task: updated };
}

function deleteTask(domain, id) {
    const conn = getDb();
    const table = DOMAIN_TABLES[domain];
    const existing = conn.prepare(`SELECT id, title FROM ${table} WHERE id = ?`).get(id);
    if (!existing) return null;

    conn.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
    return { id, title: existing.title, domain };
}

function insertTask(domain, fields) {
    const conn = getDb();
    const table = DOMAIN_TABLES[domain];
    const id = require('crypto').randomUUID();
    const now = new Date().toISOString().split('.')[0] + 'Z';

    const row = {
        id, title: fields.title.trim(), status: fields.status || 'not_started', priority: fields.priority || 'medium',
        due_date: fields.due_date || null,
        notes: fields.notes || null,
        tags: fields.tags ? JSON.stringify(fields.tags) : null,
        notion_dirty: 1,
        created_at: now,
        updated_at: now,
    };

    if (domain === 'work' || domain === 'sideproject') {
        row.project = fields.project || null;
    }

    const cols = Object.keys(row).join(', ');
    const placeholders = Object.keys(row).map(() => '?').join(', ');
    conn.prepare(`INSERT INTO ${table} (${cols}) VALUES (${placeholders})`).run(...Object.values(row));

    return conn.prepare(`SELECT *, '${domain}' as domain FROM ${table} WHERE id = ?`).get(id);
}

module.exports = {
    DOMAIN_TABLES,
    VALID_STATUSES: ['draft', 'not_started', 'in_progress', 'done', 'archived', 'blocked', 'cancelled'],
    VALID_PRIORITIES: ['low', 'medium', 'high', 'urgent'],
    isValidDomain,
    getTableName,
    getAllDomains,
    getStatsByDomain,
    findTasks,
    updateTask,
    deleteTask,
    insertTask,
};
