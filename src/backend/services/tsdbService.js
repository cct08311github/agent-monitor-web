const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');

const dbPath = path.join(__dirname, '../../../data');
/* istanbul ignore next */
if (!fs.existsSync(dbPath)) fs.mkdirSync(dbPath, { recursive: true });

const db = new Database(path.join(dbPath, 'tsdb.sqlite'), {
    // verbose: console.log 
});

db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

// Initialize schema
db.exec(`
    CREATE TABLE IF NOT EXISTS system_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        cpu REAL,
        memory REAL,
        disk REAL,
        total_agents INTEGER,
        active_agents INTEGER
    );

    CREATE TABLE IF NOT EXISTS agent_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        agent_id TEXT,
        status TEXT,
        cost REAL,
        input_tokens INTEGER,
        output_tokens INTEGER
    );

    CREATE TABLE IF NOT EXISTS alerts (
        ts INTEGER NOT NULL,
        rule TEXT NOT NULL,
        severity TEXT NOT NULL,
        message TEXT NOT NULL,
        meta TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_sys_time ON system_metrics(timestamp);
    CREATE INDEX IF NOT EXISTS idx_agent_time ON agent_metrics(timestamp);
    CREATE INDEX IF NOT EXISTS idx_agent_id ON agent_metrics(agent_id);
    CREATE INDEX IF NOT EXISTS idx_alerts_ts ON alerts(ts);
`);
// Store historical limits up to 7 days for efficiency

const insertSystemStmt = db.prepare('INSERT INTO system_metrics (cpu, memory, disk, total_agents, active_agents) VALUES (?, ?, ?, ?, ?)');
const insertAgentStmt = db.prepare('INSERT INTO agent_metrics (agent_id, status, cost, input_tokens, output_tokens) VALUES (?, ?, ?, ?, ?)');
const insertAlertStmt = db.prepare('INSERT INTO alerts (ts, rule, severity, message, meta) VALUES (?, ?, ?, ?, ?)');
const selectAlertHistoryStmt = db.prepare('SELECT ts, rule, severity, message, meta FROM alerts WHERE ts >= ? AND ts <= ? ORDER BY ts DESC LIMIT ?');

// Maintenance: Delete older than 7 days
const cleanupStmt = db.prepare(`DELETE FROM system_metrics WHERE timestamp < datetime('now', '-7 days')`);
const cleanupAgentsStmt = db.prepare(`DELETE FROM agent_metrics WHERE timestamp < datetime('now', '-7 days')`);
const cleanupAlertsStmt = db.prepare('DELETE FROM alerts WHERE ts < ?');

const selectSystemHistoryStmt = db.prepare('SELECT timestamp, cpu, memory, disk, total_agents, active_agents FROM system_metrics ORDER BY timestamp DESC LIMIT ?');
const selectAgentTopTokensStmt = db.prepare(`
    SELECT agent_id,
           SUM(input_tokens) as input_tokens,
           SUM(output_tokens) as output_tokens,
           SUM(input_tokens + output_tokens) as total
    FROM agent_metrics
    WHERE timestamp >= datetime('now', '-5 minutes')
    GROUP BY agent_id
    ORDER BY total DESC LIMIT ?
`);
const selectCostHistoryStmt = db.prepare(`
    SELECT strftime('%Y-%m-%dT%H:%M:00Z', timestamp) as ts,
           ROUND(SUM(cost), 6) as total_cost
    FROM agent_metrics
    GROUP BY strftime('%Y-%m-%dT%H:%M:00Z', timestamp)
    ORDER BY ts DESC
    LIMIT ?
`);
const selectAgentActivityStmt = db.prepare(`
    SELECT agent_id,
           MAX(timestamp) as last_seen,
           SUM(CASE WHEN status LIKE '%active%' THEN 1 ELSE 0 END) as active_snapshots
    FROM agent_metrics
    WHERE timestamp >= datetime('now', '-24 hours')
    GROUP BY agent_id
`);

function saveSnapshot(systemData, agents) {
    try {
        const insertTx = db.transaction(() => {
            const activeCount = agents.filter(a => a.status?.includes('active')).length;
            insertSystemStmt.run(systemData.cpu, systemData.memory, systemData.disk, agents.length, activeCount);

            for (const agent of agents) {
                insertAgentStmt.run(
                    agent.id,
                    agent.status,
                    agent.cost || 0,
                    agent.tokens?.input || 0,
                    agent.tokens?.output || 0
                );
            }
        });
        insertTx();
    } catch (e) {
        logger.error('tsdb_snapshot_error', { msg: e.message });
    }
}

/* istanbul ignore next */
function runCleanup() {
    try {
        cleanupStmt.run();
        cleanupAgentsStmt.run();
        cleanupAlertsStmt.run(Date.now() - 30 * 24 * 60 * 60 * 1000);
    } catch (e) {
        logger.error('tsdb_cleanup_error', { msg: e.message });
    }
}

/**
 * Persist a fired alert to SQLite.
 * Returns true on success, false on validation failure or DB error (silent).
 */
function recordAlert({ ts, rule, severity, message, meta } = {}) {
    if (typeof ts !== 'number' || !isFinite(ts)) {
        logger.warn('tsdb_record_alert_invalid', { field: 'ts', val: ts });
        return false;
    }
    if (typeof rule !== 'string' || rule.length === 0) {
        logger.warn('tsdb_record_alert_invalid', { field: 'rule', val: rule });
        return false;
    }
    if (typeof severity !== 'string' || severity.length === 0) {
        logger.warn('tsdb_record_alert_invalid', { field: 'severity', val: severity });
        return false;
    }
    if (typeof message !== 'string' || message.length === 0) {
        logger.warn('tsdb_record_alert_invalid', { field: 'message', val: message });
        return false;
    }
    try {
        const metaStr = meta !== undefined && meta !== null ? JSON.stringify(meta) : null;
        insertAlertStmt.run(ts, rule, severity, message, metaStr);
        return true;
    } catch (e) {
        logger.error('tsdb_record_alert_error', { msg: e.message });
        return false;
    }
}

/**
 * Retrieve alert history from SQLite.
 * @param {object} opts
 * @param {number} [opts.from]  - epoch ms lower bound (inclusive)
 * @param {number} [opts.to]    - epoch ms upper bound (inclusive)
 * @param {number} [opts.limit] - max rows, default 100, max 500
 * @returns {Array<{ts, rule, severity, message, meta}>}
 */
function getAlertHistory({ from, to, limit } = {}) {
    const resolvedLimit = Math.min(typeof limit === 'number' && limit > 0 ? limit : 100, 500);
    const resolvedFrom = typeof from === 'number' && from >= 0 ? from : 0;
    const resolvedTo = typeof to === 'number' && to >= 0 ? to : Date.now() + 1000;
    try {
        const rows = selectAlertHistoryStmt.all(resolvedFrom, resolvedTo, resolvedLimit);
        return rows.map(r => {
            let parsedMeta = null;
            if (r.meta !== null && r.meta !== undefined) {
                try { parsedMeta = JSON.parse(r.meta); } catch (_) { parsedMeta = r.meta; }
            }
            return { ts: r.ts, rule: r.rule, severity: r.severity, message: r.message, meta: parsedMeta };
        });
    } catch (e) {
        logger.error('tsdb_get_alert_history_error', { msg: e.message });
        return [];
    }
}

// Automatically prune daily — .unref() so this timer doesn't block process/test exit
setInterval(runCleanup, 1000 * 60 * 60 * 24).unref();

// Retrieve past N snapshots for sparklines
function getSystemHistory(limit = 60) {
    return selectSystemHistoryStmt.all(limit).reverse();
}

function getAgentTopTokens(limit = 5) {
    try {
        return selectAgentTopTokensStmt.all(limit);
    } catch (e) { /* istanbul ignore next */ return []; }
}

function getCostHistory(limit = 60) {
    try {
        return selectCostHistoryStmt.all(limit).reverse();
    } catch (e) { /* istanbul ignore next */ return []; }
}

function getAgentActivitySummary() {
    try {
        return selectAgentActivityStmt.all().map(r => ({
            agent_id: r.agent_id,
            active_minutes: r.active_snapshots,
            last_seen: r.last_seen,
        }));
    } catch (e) { /* istanbul ignore next */ return []; }
}

/**
 * Retrieve per-agent cost/token history for the past N hours.
 * @param {string} agentId - agent identifier (validated by caller)
 * @param {number} [hours=24] - lookback window 1-168
 * @returns {Array<{timestamp:string, cost:number, input_tokens:number, output_tokens:number}>}
 */
function getAgentHistory(agentId, hours = 24) {
    const parsedHours = parseInt(hours, 10);
    if (!Number.isInteger(parsedHours) || parsedHours < 1 || parsedHours > 168) {
        return [];
    }
    if (typeof agentId !== 'string' || agentId.length === 0) {
        return [];
    }
    const modifier = `-${parsedHours} hours`;
    try {
        const stmt = db.prepare(`
            SELECT timestamp, cost, input_tokens, output_tokens
            FROM agent_metrics
            WHERE agent_id = ? AND timestamp >= datetime('now', ?)
            ORDER BY timestamp ASC
        `);
        return stmt.all(agentId, modifier).map(r => ({
            timestamp: r.timestamp,
            cost: r.cost ?? 0,
            input_tokens: r.input_tokens ?? 0,
            output_tokens: r.output_tokens ?? 0,
        }));
    } catch (e) {
        logger.error('tsdb_get_agent_history_error', { msg: e.message });
        return [];
    }
}

/**
 * Close the TSDB database connection, flushing WAL to main file.
 * Safe to call multiple times.
 */
function close() {
    try {
        if (db.open) {
            db.close();
            logger.info('tsdb_closed');
        }
    } catch (e) {
        logger.error('tsdb_close_error', { details: logger.toErrorFields(e) });
    }
}

module.exports = {
    saveSnapshot,
    getSystemHistory,
    getAgentTopTokens,
    getCostHistory,
    getAgentActivitySummary,
    getAgentHistory,
    recordAlert,
    getAlertHistory,
    close,
};
