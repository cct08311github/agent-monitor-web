const fs = require('fs');
const os = require('os');
const path = require('path');
const util = require('util');
const { exec, execFile } = require('child_process');
const fetch = require('node-fetch');
const execPromise = util.promisify(exec);
const execFilePromise = util.promisify(execFile);

// --- Constants & Config ---
const DASHBOARD_CACHE_TTL_MS = 3000;
const HOME_DIR = os.homedir();
const OPENCLAW_ROOT = path.join(HOME_DIR, '.openclaw');
const DEFAULT_OPENCLAW_BIN = path.join(OPENCLAW_ROOT, 'bin', 'openclaw');

// Some deployments run this dashboard under a different OS user (e.g. systemd/root), where
// ~/.openclaw/bin/openclaw does not exist and PATH may be minimal. Resolve OpenClaw binary
// defensively using common install locations.
const OPENCLAW_BIN_CANDIDATES = [
    process.env.OPENCLAW_BIN,
    DEFAULT_OPENCLAW_BIN,
    // Homebrew (Apple Silicon / Intel)
    '/opt/homebrew/bin/openclaw',
    '/usr/local/bin/openclaw',
    // Linux
    '/usr/bin/openclaw',
    // Fallback to PATH
    'openclaw'
].filter(Boolean);

let RESOLVED_OPENCLAW_BIN = null;
async function resolveOpenclawBin() {
    if (RESOLVED_OPENCLAW_BIN) return RESOLVED_OPENCLAW_BIN;

    for (const cand of OPENCLAW_BIN_CANDIDATES) {
        // Only check fs for absolute paths; for 'openclaw' rely on execFile resolution.
        if (cand.startsWith('/') && !fs.existsSync(cand)) continue;
        try {
            // Quick smoke test: can we execute and get a version output?
            const { stdout, stderr } = await execFilePromise(cand, ['--version']);
            const out = ((stdout || '') + (stderr || '')).trim();
            if (out) {
                RESOLVED_OPENCLAW_BIN = cand;
                return RESOLVED_OPENCLAW_BIN;
            }
        } catch (e) {
            // try next candidate
        }
    }

    // Worst-case: keep using PATH fallback so other commands still attempt to run.
    RESOLVED_OPENCLAW_BIN = 'openclaw';
    return RESOLVED_OPENCLAW_BIN;
}

function parseOpenclawVersionOutput(stdout, stderr) {
    const raw = ((stdout || '') + (stderr || '')).trim();
    if (!raw) return null;
    // Prefer the last version-like token in the output (OpenClaw may print warnings before the version).
    const matches = raw.match(/\b\d+\.\d+\.\d+(?:[-a-zA-Z0-9._]+)?\b/g);
    if (matches && matches.length) return matches[matches.length - 1];
    // Fallback: return last non-empty line
    const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
    return lines.length ? lines[lines.length - 1] : null;
}

const AGENTS_ROOT = path.join(OPENCLAW_ROOT, 'agents');

let dashboardCache = { ts: 0, payload: null };

// --- Security: Dynamic path masking ---
const SENSITIVE_PATH_PREFIXES = [OPENCLAW_ROOT, HOME_DIR];
function maskSensitivePaths(input) {
    if (typeof input !== 'string' || !input) return input;
    let out = input;
    for (const prefix of SENSITIVE_PATH_PREFIXES) out = out.split(prefix).join('[REDACTED_PATH]');
    return out;
}

// --- Exchange Rate Cache (24 hours) ---
let exchangeRateCache = { rate: 32.0, lastFetch: 0 };
async function getExchangeRate() {
    const now = Date.now();
    if (now - exchangeRateCache.lastFetch < 24 * 60 * 60 * 1000) {
        return exchangeRateCache.rate;
    }
    try {
        const res = await fetch('https://open.er-api.com/v6/latest/USD');
        const data = await res.json();
        if (data && data.rates && data.rates.TWD) {
            exchangeRateCache = { rate: data.rates.TWD, lastFetch: now };
            return data.rates.TWD;
        }
    } catch (e) {
        console.error('[ExchangeRate] Fetch failed:', e.message);
    }
    return exchangeRateCache.rate;
}

// --- Helpers ---
function isToday(ms) {
    const d = new Date(ms);
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

function isThisWeek(ms) {
    const d = new Date(ms);
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const startOfWeek = new Date(now.setDate(diff));
    startOfWeek.setHours(0, 0, 0, 0);
    return d >= startOfWeek;
}

function isThisMonth(ms) {
    const d = new Date(ms);
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

// Server-Sent Events (SSE) clients
const sseClients = new Set();
let isPolling = false;

// More accurate pricing per 1M tokens (input/output averaged)
const MODEL_PRICING = {
    // OpenAI
    'gpt-5.3-codex': { input: 15, output: 60 },
    'gpt-5.2': { input: 10, output: 30 },
    'gpt-4.1': { input: 2, output: 8 },
    'gpt-4.1-mini': { input: 0.4, output: 1.6 },
    'gpt-4.1-nano': { input: 0.1, output: 0.4 },
    'o3': { input: 10, output: 40 },
    'o4-mini': { input: 1.1, output: 4.4 },
    // Google
    'gemini-3-pro': { input: 1.25, output: 5 },
    'gemini-3-flash': { input: 0.15, output: 0.6 },
    'gemini-2.5-pro': { input: 1.25, output: 10 },
    'gemini-2.5-flash': { input: 0.15, output: 0.6 },
    // Anthropic
    'claude-sonnet-4': { input: 3, output: 15 },
    'claude-4-opus': { input: 15, output: 75 },
    'claude-3.5-haiku': { input: 0.8, output: 4 },
    // DeepSeek
    'deepseek-chat': { input: 0.14, output: 0.28 },
    'deepseek-reasoner': { input: 0.55, output: 2.19 },
    // Other
    'minimax-m2.5': { input: 1.2, output: 1.2 },
    // Default fallback
    'default': { input: 1, output: 3 }
};

function getModelPricing(modelName) {
    if (!modelName) return MODEL_PRICING['default'];
    const lower = modelName.toLowerCase();
    if (MODEL_PRICING[lower]) return MODEL_PRICING[lower];
    for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
        if (key !== 'default' && lower.includes(key)) return pricing;
    }
    return MODEL_PRICING['default'];
}

function calculateCost(inputTokens, outputTokens, cacheRead, modelName) {
    const pricing = getModelPricing(modelName);
    const cacheDiscount = 0.1;
    const freshInputTokens = Math.max(0, inputTokens - (cacheRead || 0));
    const cachedTokens = cacheRead || 0;
    const inputCost = (freshInputTokens / 1_000_000) * pricing.input;
    const cacheCost = (cachedTokens / 1_000_000) * pricing.input * cacheDiscount;
    const outputCost = (outputTokens / 1_000_000) * pricing.output;
    return inputCost + cacheCost + outputCost;
}

let previousCpuInfo = null;

async function getSystemResources() {
    try {
        // CPU Usage Calculation via diff
        const cpus = os.cpus();
        let idle = 0;
        let total = 0;
        for (const cpu of cpus) {
            for (const type in cpu.times) {
                total += cpu.times[type];
            }
            idle += cpu.times.idle;
        }

        let cpuUsage = 0;
        if (previousCpuInfo && previousCpuInfo.total !== total) {
            const idleDiff = idle - previousCpuInfo.idle;
            const totalDiff = total - previousCpuInfo.total;
            cpuUsage = Math.max(0, Math.min(100, 100 - (100 * idleDiff / totalDiff)));
        } else {
            const load = os.loadavg();
            cpuUsage = Math.min(100, (load[0] / cpus.length * 100));
        }
        previousCpuInfo = { idle, total };

        // Memory usage
        const totalMem = os.totalmem();
        let freeMem = os.freemem();

        if (os.platform() === 'darwin') {
            try {
                const { stdout } = await execFilePromise('vm_stat');
                const psMatch = stdout.match(/page size of (\d+) bytes/);
                const pageSize = psMatch ? parseInt(psMatch[1], 10) : 4096;
                const getVal = (key) => {
                    const match = stdout.match(new RegExp(`${key}:\\s+(\\d+)`));
                    return match ? parseInt(match[1], 10) * pageSize : 0;
                };
                const active = getVal('Pages active');
                const wired = getVal('Pages wired down');
                const occupied = getVal('Pages occupied by compressor');
                const usedMem = active + wired + occupied;
                if (usedMem > 0) {
                    freeMem = Math.max(0, totalMem - usedMem);
                }
            } catch (e) { }
        } else if (os.platform() === 'linux') {
            try {
                const { stdout } = await execFilePromise('free', ['-b']);
                // `free` outputs table. "Mem:" line, 7th column is "available"
                const memMatch = stdout.match(/Mem:\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+(\d+)/);
                if (memMatch) {
                    freeMem = parseInt(memMatch[1], 10);
                }
            } catch (e) { }
        }

        const memUsage = ((totalMem - freeMem) / totalMem * 100).toFixed(1);

        let diskUsage = '0';
        try {
            // Using execFile for df is safer
            const { stdout } = await execFilePromise('df', ['-h', '/']);
            const lastLine = stdout.trim().split('\n').pop();
            const match = lastLine.match(/(\d+)%/);
            if (match) diskUsage = match[1];
        } catch (e) { }

        const uptimeSeconds = os.uptime();
        const hours = Math.floor(uptimeSeconds / 3600);
        const minutes = Math.floor((uptimeSeconds % 3600) / 60);
        return {
            cpu: parseFloat(cpuUsage.toFixed(1)),
            memory: parseFloat(memUsage),
            memoryUsedGB: ((totalMem - freeMem) / (1024 ** 3)).toFixed(2),
            memoryTotalGB: (totalMem / (1024 ** 3)).toFixed(0),
            disk: parseFloat(diskUsage),
            uptime: `${hours}h ${minutes}m`
        };
    } catch (e) {
        return { cpu: 0, memory: 0, memoryUsedGB: '0', memoryTotalGB: '0', disk: 0, uptime: '0h' };
    }
}

function parseAgentsList(text) {
    const agents = [];
    const lines = text.split('\n');
    let currentAgent = null;
    for (const line of lines) {
        const agentMatch = line.match(/^- (\w+)(?:\s+\(([^)]+)\))?/);
        if (agentMatch) {
            if (currentAgent) agents.push(currentAgent);
            currentAgent = { id: agentMatch[1], name: agentMatch[2] || agentMatch[1], workspace: '', model: '' };
        }
        if (currentAgent && line.trim().startsWith('Model:')) {
            const m = line.match(/Model:\s+(.+)/);
            if (m) currentAgent.model = m[1].trim();
        }
        if (currentAgent && line.includes('Workspace:')) {
            const w = line.match(/Workspace:\s+(.+)/);
            if (w) currentAgent.workspace = w[1].trim();
        }
    }
    if (currentAgent) agents.push(currentAgent);
    return agents;
}

function detectDetailedActivity(agentId) {
    let detail = {
        status: 'inactive',
        cost: 0,
        costs: { today: 0, week: 0, month: 0, total: 0 },
        lastActivity: 'never',
        tokens: { input: 0, output: 0, cacheRead: 0, total: 0 },
        currentTask: { label: 'Idle', task: '' },
        modelUsage: {},
        activeModel: null,
        activeProvider: null,
    };

    try {
        const agentDir = path.join(AGENTS_ROOT, agentId, 'sessions');
        const sessionJsonPath = path.join(agentDir, 'sessions.json');

        if (fs.existsSync(sessionJsonPath)) {
            const json = JSON.parse(fs.readFileSync(sessionJsonPath, 'utf8'));
            let totalCost = 0;
            const modelUsage = {};
            let latestSessionTime = 0;

            Object.keys(json).forEach(k => {
                if (k.includes(':subagent:')) return;
                const s = json[k];
                const updatedAt = Number(s.updatedAt || 0);
                const sessionInput = s.inputTokens || 0;
                const sessionOutput = s.outputTokens || 0;
                const sessionCacheRead = s.cacheRead || 0;
                const sessionModel = s.model || 'unknown';
                const sessionTotal = s.totalTokens || (sessionInput + sessionOutput);

                detail.tokens.input += sessionInput;
                detail.tokens.output += sessionOutput;
                detail.tokens.cacheRead += sessionCacheRead;

                if (!modelUsage[sessionModel]) {
                    modelUsage[sessionModel] = { input: 0, output: 0, cacheRead: 0, total: 0, cost: 0, sessions: 0 };
                }
                modelUsage[sessionModel].input += sessionInput;
                modelUsage[sessionModel].output += sessionOutput;
                modelUsage[sessionModel].cacheRead += sessionCacheRead;
                modelUsage[sessionModel].total += sessionTotal;
                modelUsage[sessionModel].sessions += 1;

                const sessionCost = calculateCost(sessionInput, sessionOutput, sessionCacheRead, sessionModel);
                modelUsage[sessionModel].cost += sessionCost;
                totalCost += sessionCost;

                if (updatedAt > 0) {
                    if (isToday(updatedAt)) detail.costs.today += sessionCost;
                    if (isThisWeek(updatedAt)) detail.costs.week += sessionCost;
                    if (isThisMonth(updatedAt)) detail.costs.month += sessionCost;
                }

                if (updatedAt >= latestSessionTime && s.model) {
                    latestSessionTime = updatedAt;
                    detail.activeModel = s.model;
                    detail.activeProvider = s.modelProvider || null;
                }
            });

            detail.tokens.total = detail.tokens.input + detail.tokens.output;
            detail.costs.total = totalCost;
            detail.cost = totalCost.toFixed(4);
            detail.modelUsage = modelUsage;
        }

        if (fs.existsSync(agentDir)) {
            const files = fs.readdirSync(agentDir)
                .filter(f => f.endsWith('.jsonl'))
                .map(f => ({ name: f, time: fs.statSync(path.join(agentDir, f)).mtimeMs }))
                .sort((a, b) => b.time - a.time);

            if (files.length > 0) {
                const mtime = files[0].time;
                const lines = fs.readFileSync(path.join(agentDir, files[0].name), 'utf8').trim().split('\n');
                if (lines.length > 0) {
                    try {
                        const lastLog = JSON.parse(lines[lines.length - 1]);
                        const msgObj = lastLog.message || lastLog;
                        let content = "";
                        if (msgObj.content && Array.isArray(msgObj.content)) content = msgObj.content.filter(c => c.type === 'text').map(c => c.text).join(' ');
                        else if (typeof msgObj.content === 'string') content = msgObj.content;
                        if (content) detail.currentTask = { label: (Date.now() - mtime < 300000) ? 'EXECUTING' : 'IDLE', task: content.substring(0, 2000) };
                    } catch (e) { }
                }
                detail.minutesAgo = Math.floor((Date.now() - mtime) / 60000);
                detail.lastActivity = detail.minutesAgo < 9999 ? `${detail.minutesAgo}m ago` : 'never';
                if (detail.minutesAgo < 5) detail.status = 'active_executing';
                else if (detail.minutesAgo < 60) detail.status = 'active_recent';
                else detail.status = 'dormant';
            }
        }
        return detail;
    } catch (e) {
        return detail;
    }
}

function buildSubagentStatus() {
    const subagents = [];
    try {
        const agentDirs = fs.readdirSync(AGENTS_ROOT);
        for (const agentDirName of agentDirs) {
            const sessionsPath = path.join(AGENTS_ROOT, agentDirName, 'sessions', 'sessions.json');
            if (!fs.existsSync(sessionsPath)) continue;
            let sessions;
            try { sessions = JSON.parse(fs.readFileSync(sessionsPath, 'utf8')); } catch (e) { continue; }

            for (const [sessionKey, meta] of Object.entries(sessions)) {
                if (!sessionKey.includes(':subagent:')) continue;
                const updatedAt = Number(meta?.updatedAt || 0);
                const createdAt = Number(meta?.createdAt || updatedAt);
                const minutesAgo = updatedAt > 0 ? Math.floor((Date.now() - updatedAt) / 60000) : null;
                const durationMs = updatedAt > createdAt ? (updatedAt - createdAt) : 0;
                let status = 'idle';
                if (minutesAgo !== null && minutesAgo <= 5) status = 'running';
                else if (minutesAgo !== null && minutesAgo <= 60) status = 'recent';
                const parts = sessionKey.split(':');
                subagents.push({
                    key: sessionKey, ownerAgent: parts[1] || agentDirName, subagentId: parts[3] || 'unknown',
                    status, updatedAt, createdAt, duration: durationMs > 0 ? `${Math.floor(durationMs / 1000)}s` : null,
                    lastActivity: minutesAgo === null ? 'unknown' : (minutesAgo < 1 ? 'just now' : `${minutesAgo}m ago`),
                    tokens: Number(meta?.totalTokens || 0), abortedLastRun: !!meta?.abortedLastRun,
                    label: meta?.label || meta?.model || 'Sub-Agent Task', model: meta?.model || 'unknown'
                });
            }
        }
    } catch (e) { }
    const rank = { running: 0, recent: 1, idle: 2 };
    subagents.sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9) || (a.minutesAgo ?? 999999) - (b.minutesAgo ?? 999999));
    return subagents;
}

async function buildDashboardPayload() {
    const now = Date.now();
    if (dashboardCache.payload && now - dashboardCache.ts < DASHBOARD_CACHE_TTL_MS) {
        return dashboardCache.payload;
    }

    const ocBin = await resolveOpenclawBin();

    const [sys, agentsResult, cronResult, openclawVersionResult, exchangeRate] = await Promise.all([
        getSystemResources(),
        execFilePromise(ocBin, ['agents', 'list']).catch(() => ({ stdout: '' })),
        execFilePromise(ocBin, ['cron', 'list', '--json']).catch(() => ({ stdout: '{"jobs":[]}' })),
        execFilePromise(ocBin, ['--version']).catch(() => ({ stdout: '' })),
        getExchangeRate()
    ]);

    const agents = parseAgentsList(agentsResult.stdout || '').map(a => {
        const activity = detectDetailedActivity(a.id);
        // Priority: parsed model from agents config > activeModel from session
        return { ...a, ...activity, model: a.model || activity.activeModel, activeModel: activity.activeModel };
    });

    let cronJobs = [];
    try {
        const parsedCron = JSON.parse(cronResult.stdout || '{"jobs":[]}');
        cronJobs = Array.isArray(parsedCron.jobs) ? parsedCron.jobs : [];
    } catch (e) { }

    const cron = cronJobs.map(j => ({
        id: j.id, name: j.name, enabled: j.enabled !== false,
        next: j.state?.nextRunAtMs, status: j.state?.lastStatus || 'ok',
        lastRunAt: j.state?.lastRunAtMs, lastError: j.state?.lastError || ''
    }));

    const subagents = buildSubagentStatus();
    const { fetchModelCooldowns } = require('../utils/modelMonitor');
    const cooldowns = await fetchModelCooldowns();

    const openclawVersion = parseOpenclawVersionOutput(openclawVersionResult.stdout, openclawVersionResult.stderr);

    const payload = { success: true, openclaw: { version: openclawVersion || null }, sys, agents, cron, subagents, cooldowns, exchangeRate };
    dashboardCache = { ts: now, payload };
    return payload;
}

function truncate(input, maxLen) {
    if (typeof input !== 'string') return '';
    if (input.length <= maxLen) return input;
    return input.slice(0, Math.max(0, maxLen - 1)) + '…';
}

function minimizeDashboardPayload(payload) {
    const safeAgents = Array.isArray(payload.agents) ? payload.agents.map((a) => {
        const safeWorkspace = a && a.workspace ? '[REDACTED_WORKSPACE]' : a.workspace;
        const safeCurrentTask = a && a.currentTask ? {
            ...a.currentTask,
            task: maskSensitivePaths(String(a.currentTask.task || ''))
        } : a.currentTask;
        return { ...a, workspace: safeWorkspace, currentTask: safeCurrentTask };
    }) : [];
    return { ...payload, agents: safeAgents };
}

// --- SSE Performance Optimization: Shared Background Poller ---
let lastSnapshotTime = 0;
const TSDB_SNAPSHOT_INTERVAL = 60000;
const tsdbService = require('../services/tsdbService');
const agentWatcherService = require('../services/agentWatcherService');
const alertEngine = require('../services/alertEngine');

let sharedPayload = null;
let lastUpdateTs = 0;
let pendingUpdate = null;

async function _doUpdateSharedData() {
    try {
        const payload = await buildDashboardPayload();
        sharedPayload = minimizeDashboardPayload(payload);
        lastUpdateTs = Date.now();

        // Time-series persistence
        if (lastUpdateTs - lastSnapshotTime >= TSDB_SNAPSHOT_INTERVAL) {
            lastSnapshotTime = lastUpdateTs;
            tsdbService.saveSnapshot(sharedPayload.sys || {}, sharedPayload.agents || []);
        }

        // Alert evaluation — push to SSE if any fired
        const firedAlerts = alertEngine.evaluate(sharedPayload);
        if (firedAlerts.length > 0) {
            const alertStr = `event: alert\ndata: ${JSON.stringify({ alerts: firedAlerts })}\n\n`;
            sseClients.forEach((client) => {
                try { client.write(alertStr); } catch (e) { sseClients.delete(client); }
            });
        }

        return true;
    } catch (e) {
        console.error('[Poller] Update failed:', e);
        return false;
    }
}

async function updateSharedData() {
    if (pendingUpdate) return pendingUpdate;
    pendingUpdate = _doUpdateSharedData().finally(() => { pendingUpdate = null; });
    return pendingUpdate;
}

async function doBroadcast() {
    if (sseClients.size === 0) return;
    if (!sharedPayload) await updateSharedData();

    const dataStr = `data: ${JSON.stringify(sharedPayload)}\n\n`;
    sseClients.forEach((res) => {
        try { res.write(dataStr); } catch (e) { sseClients.delete(res); }
    });
}

function startGlobalPolling() {
    if (isPolling) return;
    isPolling = true;

    agentWatcherService.start();
    agentWatcherService.on('state_update', async () => {
        await updateSharedData();
        doBroadcast();
    });

    // Fallback timer: Refresh data every 15s regardless of file changes
    setInterval(async () => {
        await updateSharedData();
        doBroadcast();
    }, 15000);
}

class DashboardController {
    async getDashboard(req, res) {
        try {
            // Clear cache if force refresh requested
            if (req.query.force === '1') {
                sharedPayload = null;
                lastUpdateTs = 0;
            }
            if (!sharedPayload || Date.now() - lastUpdateTs > 5000) {
                await updateSharedData();
            }
            res.json(sharedPayload);
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async getHistory(req, res) {
        try {
            const history = tsdbService.getSystemHistory(60);
            const topSpenders = tsdbService.getAgentTopTokens(5);
            res.json({ success: true, history, topSpenders });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async streamDashboard(req, res) {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        });

        sseClients.add(res);
        startGlobalPolling();

        if (sharedPayload) {
            res.write(`data: ${JSON.stringify(sharedPayload)}\n\n`);
        }

        req.on('close', () => {
            sseClients.delete(res);
        });
    }

    async getStatus(req, res) {
        try {
            const ocBin = await resolveOpenclawBin();
            const { stdout, stderr } = await execFilePromise(ocBin, ['status']);
            res.json({ success: true, output: (stdout || '') + (stderr || '') });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message, output: (error.stdout || '') + (error.stderr || '') });
        }
    }

    async getModels(req, res) {
        try {
            const ocBin = await resolveOpenclawBin();
            const { stdout, stderr } = await execFilePromise(ocBin, ['models', 'status']);
            res.json({ success: true, output: (stdout || '') + (stderr || '') });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message, output: (error.stdout || '') + (error.stderr || '') });
        }
    }

    async getAgents(req, res) {
        try {
            const { stdout, stderr } = await execFilePromise(ocBin, ['agents', 'list']);
            res.json({ success: true, output: (stdout || '') + (stderr || '') });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message, output: (error.stdout || '') + (error.stderr || '') });
        }
    }
}

module.exports = new DashboardController();
