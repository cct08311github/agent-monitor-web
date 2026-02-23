const fs = require('fs');
const os = require('os');
const path = require('path');
const util = require('util');
const { exec } = require('child_process');
const fetch = require('node-fetch');
const execPromise = util.promisify(exec);

const DASHBOARD_CACHE_TTL_MS = 3000;
let dashboardCache = { ts: 0, payload: null };

// Exchange Rate Cache (24 hours)
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

// Time range helpers
function isToday(ms) {
    const d = new Date(ms);
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

function isThisWeek(ms) {
    const d = new Date(ms);
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Adjust to Monday
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
// Based on actual 2026 pricing for these providers
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
    // Try exact match first
    if (MODEL_PRICING[lower]) return MODEL_PRICING[lower];
    // Try partial match
    for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
        if (key !== 'default' && lower.includes(key)) return pricing;
    }
    return MODEL_PRICING['default'];
}

function calculateCost(inputTokens, outputTokens, cacheRead, modelName) {
    const pricing = getModelPricing(modelName);
    // Cache read tokens are typically 90% cheaper
    const cacheDiscount = 0.1;
    const freshInputTokens = Math.max(0, inputTokens - (cacheRead || 0));
    const cachedTokens = cacheRead || 0;
    const inputCost = (freshInputTokens / 1_000_000) * pricing.input;
    const cacheCost = (cachedTokens / 1_000_000) * pricing.input * cacheDiscount;
    const outputCost = (outputTokens / 1_000_000) * pricing.output;
    return inputCost + cacheCost + outputCost;
}

async function getSystemResources() {
    try {
        const cpus = os.cpus();
        const load = os.loadavg();
        const cpuUsage = Math.min(100, (load[0] / cpus.length * 100)).toFixed(1);
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const memUsage = ((totalMem - freeMem) / totalMem * 100).toFixed(1);
        let diskUsage = '0';
        try {
            const { stdout } = await execPromise("df -h / | tail -1 | awk '{print $5}' | sed 's/%//' ");
            diskUsage = stdout.trim();
        } catch (e) { }
        const uptimeSeconds = os.uptime();
        const hours = Math.floor(uptimeSeconds / 3600);
        const minutes = Math.floor((uptimeSeconds % 3600) / 60);
        return {
            cpu: parseFloat(cpuUsage),
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
        modelUsage: {},  // per-model breakdown
        activeModel: null,
        activeProvider: null,
    };

    try {
        const agentDir = path.join('/Users/openclaw/.openclaw/agents', agentId, 'sessions');
        const sessionJsonPath = path.join(agentDir, 'sessions.json');

        if (fs.existsSync(sessionJsonPath)) {
            const json = JSON.parse(fs.readFileSync(sessionJsonPath, 'utf8'));
            let totalCost = 0;
            const modelUsage = {};

            Object.keys(json).forEach(k => {
                // Skip subagent sessions for the agent-level summary
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

                // Track per-model usage
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

                // Periodic cost calculation
                if (updatedAt > 0) {
                    if (isToday(updatedAt)) detail.costs.today += sessionCost;
                    if (isThisWeek(updatedAt)) detail.costs.week += sessionCost;
                    if (isThisMonth(updatedAt)) detail.costs.month += sessionCost;
                }

                // Track active model based on most recent session
                if (s.model) {
                    detail.activeModel = s.model;
                    detail.activeProvider = s.modelProvider || null;
                }
            });

            detail.tokens.total = detail.tokens.input + detail.tokens.output;
            detail.costs.total = totalCost;
            detail.cost = totalCost.toFixed(4); // Keep for legacy
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
                        if (content) detail.currentTask = { label: (Date.now() - mtime < 300000) ? 'EXECUTING' : 'IDLE', task: content.substring(0, 500) };
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
    const agentsRoot = '/Users/openclaw/.openclaw/agents';
    try {
        const agentDirs = fs.readdirSync(agentsRoot).map((name) => path.join(agentsRoot, name, 'sessions', 'sessions.json'));
        for (const sessionsPath of agentDirs) {
            if (!fs.existsSync(sessionsPath)) continue;
            let sessions;
            try {
                sessions = JSON.parse(fs.readFileSync(sessionsPath, 'utf8'));
            } catch (e) { continue; }

            for (const [sessionKey, meta] of Object.entries(sessions)) {
                if (!sessionKey.includes(':subagent:')) continue;
                const updatedAt = Number(meta?.updatedAt || 0);
                const minutesAgo = updatedAt > 0 ? Math.floor((Date.now() - updatedAt) / 60000) : null;
                const totalTokens = Number(meta?.totalTokens || meta?.inputTokens || 0) + Number(meta?.outputTokens || 0);
                let status = 'idle';
                if (minutesAgo !== null && minutesAgo <= 5) status = 'running';
                else if (minutesAgo !== null && minutesAgo <= 60) status = 'recent';

                const parts = sessionKey.split(':');
                subagents.push({
                    key: sessionKey,
                    ownerAgent: parts[1] || 'unknown',
                    subagentId: parts[3] || 'unknown',
                    status,
                    minutesAgo,
                    lastActivity: minutesAgo === null ? 'unknown' : `${minutesAgo}m ago`,
                    tokens: totalTokens,
                    abortedLastRun: !!meta?.abortedLastRun,
                    spawnedBy: meta?.spawnedBy || null,
                    label: meta?.label || null,
                });
            }
        }
    } catch (e) { }

    const rank = { running: 0, recent: 1, idle: 2 };
    subagents.sort((a, b) => {
        const ra = rank[a.status] ?? 9;
        const rb = rank[b.status] ?? 9;
        if (ra !== rb) return ra - rb;
        return (a.minutesAgo ?? 999999) - (b.minutesAgo ?? 999999);
    });
    return subagents;
}

async function buildDashboardPayload() {
    const now = Date.now();
    if (dashboardCache.payload && now - dashboardCache.ts < DASHBOARD_CACHE_TTL_MS) {
        return dashboardCache.payload;
    }

    const [sys, agentsResult, cronResult, exchangeRate] = await Promise.all([
        getSystemResources(),
        execPromise('/Users/openclaw/.openclaw/bin/openclaw agents list').catch(() => ({ stdout: '' })),
        execPromise('/Users/openclaw/.openclaw/bin/openclaw cron list --json').catch(() => ({ stdout: '{"jobs":[]}' })),
        getExchangeRate()
    ]);

    const agents = parseAgentsList(agentsResult.stdout || '').map(a => ({ ...a, ...detectDetailedActivity(a.id) }));

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

    // Fetch Model Cooldowns
    const { fetchModelCooldowns } = require('../utils/modelMonitor');
    const cooldowns = await fetchModelCooldowns();

    const payload = { success: true, sys, agents, cron, subagents, cooldowns, exchangeRate };
    dashboardCache = { ts: now, payload };
    return payload;
}

const SENSITIVE_PATH_PREFIXES = ['/Users/openclaw/.openclaw', '/Users/openclaw'];
function maskSensitivePaths(input) {
    if (typeof input !== 'string' || !input) return input;
    let out = input;
    for (const prefix of SENSITIVE_PATH_PREFIXES) out = out.split(prefix).join('[REDACTED_PATH]');
    return out;
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
            task: truncate(maskSensitivePaths(String(a.currentTask.task || '')), 120)
        } : a.currentTask;
        return { ...a, workspace: safeWorkspace, currentTask: safeCurrentTask };
    }) : [];
    return { ...payload, agents: safeAgents };
}

// Event-driven real-time push mechanism
let lastSnapshotTime = 0;
const TSDB_SNAPSHOT_INTERVAL = 60000; // 60s
const tsdbService = require('../services/tsdbService');
const agentWatcherService = require('../services/agentWatcherService');

let broadcastTimeout = null;

async function doBroadcast() {
    if (sseClients.size === 0) return;
    try {
        const payload = await buildDashboardPayload();
        const minimized = minimizeDashboardPayload(payload);
        const dataStr = `data: ${JSON.stringify(minimized)}\n\n`;
        sseClients.forEach((res) => res.write(dataStr));

        // Log time-series snapshot every 60s
        const now = Date.now();
        if (now - lastSnapshotTime >= TSDB_SNAPSHOT_INTERVAL) {
            lastSnapshotTime = now;
            tsdbService.saveSnapshot(minimized.sys || {}, minimized.agents || []);
        }
    } catch (error) {
        console.error('[SSE] Broadcast error:', error);
    }
}

function startGlobalPolling() {
    if (isPolling) return;
    isPolling = true;

    // Start watching physical JSON state files instead of polling CLI
    agentWatcherService.start();

    // Event-driven listener (debounce to avoid IO spam)
    agentWatcherService.on('state_update', () => {
        if (broadcastTimeout) clearTimeout(broadcastTimeout);
        broadcastTimeout = setTimeout(doBroadcast, 500); // 500ms debounce
    });

    // Fallback heartbeat (mainly for system CPU/RAM trends)
    setInterval(doBroadcast, 15000); // Every 15 seconds mostly for heartbeat if agents are idle
}

class DashboardController {
    async getDashboard(req, res) {
        try {
            const payload = await buildDashboardPayload();
            res.json(minimizeDashboardPayload(payload));
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async getHistory(req, res) {
        try {
            const history = tsdbService.getSystemHistory(60); // Get last 60 points
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

        try {
            const payload = await buildDashboardPayload();
            res.write(`data: ${JSON.stringify(minimizeDashboardPayload(payload))}\n\n`);
        } catch (e) {
            console.error('[SSE] Initial load error:', e);
        }

        req.on('close', () => {
            sseClients.delete(res);
        });
    }

    async getStatus(req, res) {
        try {
            const { stdout, stderr } = await execPromise('/Users/openclaw/.openclaw/bin/openclaw status');
            res.json({ success: true, output: (stdout || '') + (stderr || '') });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message, output: (error.stdout || '') + (error.stderr || '') });
        }
    }

    async getModels(req, res) {
        try {
            const { stdout, stderr } = await execPromise('/Users/openclaw/.openclaw/bin/openclaw models status');
            res.json({ success: true, output: (stdout || '') + (stderr || '') });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message, output: (error.stdout || '') + (error.stderr || '') });
        }
    }

    async getAgents(req, res) {
        try {
            const { stdout, stderr } = await execPromise('/Users/openclaw/.openclaw/bin/openclaw agents list');
            res.json({ success: true, output: (stdout || '') + (stderr || '') });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message, output: (error.stdout || '') + (error.stderr || '') });
        }
    }
}

module.exports = new DashboardController();
