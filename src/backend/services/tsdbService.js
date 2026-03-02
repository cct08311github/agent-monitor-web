const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '../../../data');
if (!fs.existsSync(dbPath)) fs.mkdirSync(dbPath, { recursive: true });

const db = new Database(path.join(dbPath, 'tsdb.sqlite'), {
    // verbose: console.log 
});

db.pragma('journal_mode = WAL');

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

    CREATE INDEX IF NOT EXISTS idx_sys_time ON system_metrics(timestamp);
    CREATE INDEX IF NOT EXISTS idx_agent_time ON agent_metrics(timestamp);
    CREATE INDEX IF NOT EXISTS idx_agent_id ON agent_metrics(agent_id);
`); // Store historical limits up to 7 days for efficiency

const insertSystemStmt = db.prepare('INSERT INTO system_metrics (cpu, memory, disk, total_agents, active_agents) VALUES (?, ?, ?, ?, ?)');
const insertAgentStmt = db.prepare('INSERT INTO agent_metrics (agent_id, status, cost, input_tokens, output_tokens) VALUES (?, ?, ?, ?, ?)');

// Maintenance: Delete older than 7 days
const cleanupStmt = db.prepare(`DELETE FROM system_metrics WHERE timestamp < datetime('now', '-7 days')`);
const cleanupAgentsStmt = db.prepare(`DELETE FROM agent_metrics WHERE timestamp < datetime('now', '-7 days')`);

function saveSnapshot(systemData, agents) {
    try {
        const insertTx = db.transaction(() => {
            const activeCount = agents.filter(a => a.status.includes('active')).length;
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
        console.error('[TSDB] Snapshot error:', e);
    }
}

function runCleanup() {
    try {
        cleanupStmt.run();
        cleanupAgentsStmt.run();
    } catch (e) {
        console.error('[TSDB] Cleanup error:', e);
    }
}

// Automatically prune daily — .unref() so this timer doesn't block process/test exit
setInterval(runCleanup, 1000 * 60 * 60 * 24).unref();

// Retrieve past N snapshots for sparklines
function getSystemHistory(limit = 60) {
    // 60 minutes default if interval is 1m
    const stmt = db.prepare('SELECT * FROM system_metrics ORDER BY timestamp DESC LIMIT ?');
    return stmt.all(limit).reverse();
}

function getAgentTopTokens(limit = 5) {
    // Assuming we want the latest snapshot of each top token consuming agent
    const stmt = db.prepare(`
        SELECT agent_id, input_tokens, output_tokens, (input_tokens + output_tokens) as total 
        FROM agent_metrics 
        WHERE timestamp >= datetime('now', '-5 minutes')
        GROUP BY agent_id
        ORDER BY total DESC LIMIT ?
    `);
    try {
        return stmt.all(limit);
    } catch (e) {
        return [];
    }
}

function getCostHistory(limit = 60) {
    const stmt = db.prepare(`
        SELECT strftime('%Y-%m-%dT%H:%M:00Z', timestamp) as ts,
               ROUND(SUM(cost), 6) as total_cost
        FROM agent_metrics
        GROUP BY strftime('%Y-%m-%dT%H:%M:00Z', timestamp)
        ORDER BY ts DESC
        LIMIT ?
    `);
    try {
        return stmt.all(limit).reverse();
    } catch (e) {
        return [];
    }
}

function getAgentActivitySummary() {
    const stmt = db.prepare(`
        SELECT agent_id,
               MAX(timestamp) as last_seen,
               SUM(CASE WHEN status LIKE '%active%' THEN 1 ELSE 0 END) as active_snapshots
        FROM agent_metrics
        WHERE timestamp >= datetime('now', '-24 hours')
        GROUP BY agent_id
    `);
    try {
        return stmt.all().map(r => ({
            agent_id: r.agent_id,
            active_minutes: r.active_snapshots,
            last_seen: r.last_seen,
        }));
    } catch (e) {
        return [];
    }
}

module.exports = {
    saveSnapshot,
    getSystemHistory,
    getAgentTopTokens,
    getCostHistory,
    getAgentActivitySummary
};
