'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const util = require('util');
const { exec, execFile } = require('child_process');
const fetch = require('node-fetch');

const execFilePromise = util.promisify(execFile);
const logger = require('../utils/logger');
const { getDashboardPollingConfig } = require('../config');
const tsdbService = require('./tsdbService');
const agentWatcherService = require('./agentWatcherService');
const alertEngine = require('./alertEngine');
const { fetchModelCooldowns } = require('../utils/modelMonitor');

const pollingConfig = getDashboardPollingConfig();
const cache = {
    sys:       { data: null, ts: 0, ttl: pollingConfig.cacheTtlSysMs },
    agents:    { data: null, ts: 0, ttl: pollingConfig.cacheTtlAgentsMs },
    subagents: { data: null, ts: 0, ttl: pollingConfig.cacheTtlAgentsMs },
    cron:      { data: null, ts: 0, ttl: pollingConfig.cacheTtlCronMs },
    cooldowns: { data: null, ts: 0, ttl: pollingConfig.cacheTtlCooldownsMs },
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

const HOME_DIR = os.homedir();
const OPENCLAW_ROOT = path.join(HOME_DIR, '.openclaw');
const DEFAULT_OPENCLAW_BIN = path.join(OPENCLAW_ROOT, 'bin', 'openclaw');
const OPENCLAW_BIN_CANDIDATES = [
    process.env.OPENCLAW_BIN,
    DEFAULT_OPENCLAW_BIN,
    '/opt/homebrew/bin/openclaw',
    '/usr/local/bin/openclaw',
    '/usr/bin/openclaw',
    'openclaw',
].filter(Boolean);
const AGENTS_ROOT = path.join(OPENCLAW_ROOT, 'agents');
const SENSITIVE_PATH_PREFIXES = [OPENCLAW_ROOT, HOME_DIR];
const TSDB_SNAPSHOT_INTERVAL = pollingConfig.tsdbSnapshotIntervalMs;

const MODEL_PRICING = {
    'gpt-5.3-codex': { input: 15, output: 60 },
    'gpt-5.2': { input: 10, output: 30 },
    'gpt-4.1': { input: 2, output: 8 },
    'gpt-4.1-mini': { input: 0.4, output: 1.6 },
    'gpt-4.1-nano': { input: 0.1, output: 0.4 },
    'o3': { input: 10, output: 40 },
    'o4-mini': { input: 1.1, output: 4.4 },
    'gemini-3-pro': { input: 1.25, output: 5 },
    'gemini-3-flash': { input: 0.15, output: 0.6 },
    'gemini-2.5-pro': { input: 1.25, output: 10 },
    'gemini-2.5-flash': { input: 0.15, output: 0.6 },
    'claude-sonnet-4': { input: 3, output: 15 },
    'claude-4-opus': { input: 15, output: 75 },
    'claude-3.5-haiku': { input: 0.8, output: 4 },
    'deepseek-chat': { input: 0.14, output: 0.28 },
    'deepseek-reasoner': { input: 0.55, output: 2.19 },
    'minimax-m2.5': { input: 1.2, output: 1.2 },
    default: { input: 1, output: 3 },
};

let RESOLVED_OPENCLAW_BIN = null;
let exchangeRateCache = { rate: 32.0, lastFetch: 0 };
let previousCpuInfo = null;
const sseClients = new Set();
let isPolling = false;
let lastSnapshotTime = 0;
let sharedPayload = null;
let lastUpdateTs = 0;
let pendingUpdate = null;
let cachedOcVersion = null;

function parseOpenclawVersionOutput(stdout, stderr) {
    const raw = ((stdout || '') + (stderr || '')).trim();
    if (!raw) return null;
    const matches = raw.match(/\b\d+\.\d+\.\d+(?:[-a-zA-Z0-9._]+)?\b/g);
    if (matches && matches.length) return matches[matches.length - 1];
    const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
    return lines.length ? lines[lines.length - 1] : null;
}

async function resolveOpenclawBin() {
    if (RESOLVED_OPENCLAW_BIN) return RESOLVED_OPENCLAW_BIN;

    for (const cand of OPENCLAW_BIN_CANDIDATES) {
        if (cand.startsWith('/') && !fs.existsSync(cand)) continue;
        try {
            const { stdout, stderr } = await execFilePromise(cand, ['--version']);
            const out = ((stdout || '') + (stderr || '')).trim();
            if (out) {
                RESOLVED_OPENCLAW_BIN = cand;
                return RESOLVED_OPENCLAW_BIN;
            }
        } catch (e) {
            // Candidate probing is expected to fail on machines where only one
            // OpenClaw binary location exists, so keep this path silent.
        }
    }

    RESOLVED_OPENCLAW_BIN = 'openclaw';
    return RESOLVED_OPENCLAW_BIN;
}

function maskSensitivePaths(input) {
    if (typeof input !== 'string' || !input) return input;
    let out = input;
    for (const prefix of SENSITIVE_PATH_PREFIXES) out = out.split(prefix).join('[REDACTED_PATH]');
    return out;
}

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
        logger.error('exchange_rate_fetch_failed', { msg: e.message });
    }
    return exchangeRateCache.rate;
}

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

function getModelPricing(modelName) {
    if (!modelName) return MODEL_PRICING.default;
    const lower = modelName.toLowerCase();
    if (MODEL_PRICING[lower]) return MODEL_PRICING[lower];
    for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
        if (key !== 'default' && lower.includes(key)) return pricing;
    }
    return MODEL_PRICING.default;
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

async function getSystemResources() {
    try {
        const cpus = os.cpus();
        let idle = 0;
        let total = 0;
        for (const cpu of cpus) {
            for (const type in cpu.times) total += cpu.times[type];
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
                if (usedMem > 0) freeMem = Math.max(0, totalMem - usedMem);
            } catch (e) {
                // vm_stat is optional best-effort enrichment on macOS.
            }
        } else if (os.platform() === 'linux') {
            try {
                const { stdout } = await execFilePromise('free', ['-b']);
                const memMatch = stdout.match(/Mem:\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+(\d+)/);
                if (memMatch) freeMem = parseInt(memMatch[1], 10);
            } catch (e) {
                // free(1) is optional best-effort enrichment on Linux.
            }
        }

        const memUsage = ((totalMem - freeMem) / totalMem * 100).toFixed(1);

        let diskUsage = '0';
        try {
            const { stdout } = await execFilePromise('df', ['-h', '/']);
            const lastLine = stdout.trim().split('\n').pop();
            const match = lastLine.match(/(\d+)%/);
            if (match) diskUsage = match[1];
        } catch (e) {
            // Disk usage is non-critical; preserve payload generation if df fails.
        }

        const uptimeSeconds = os.uptime();
        const hours = Math.floor(uptimeSeconds / 3600);
        const minutes = Math.floor((uptimeSeconds % 3600) / 60);
        return {
            cpu: parseFloat(cpuUsage.toFixed(1)),
            memory: parseFloat(memUsage),
            memoryUsedGB: ((totalMem - freeMem) / (1024 ** 3)).toFixed(2),
            memoryTotalGB: (totalMem / (1024 ** 3)).toFixed(0),
            disk: parseFloat(diskUsage),
            uptime: `${hours}h ${minutes}m`,
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

async function detectDetailedActivity(agentId) {
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

        const sessionJsonExists = await fs.promises.access(sessionJsonPath).then(() => true).catch(() => false);
        if (sessionJsonExists) {
            const json = JSON.parse(await fs.promises.readFile(sessionJsonPath, 'utf8'));
            let totalCost = 0;
            const modelUsage = {};
            let latestSessionTime = 0;

            Object.keys(json).forEach((k) => {
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

        const agentDirExists = await fs.promises.access(agentDir).then(() => true).catch(() => false);
        if (agentDirExists) {
            const allFiles = await fs.promises.readdir(agentDir);
            const jsonlFiles = allFiles.filter((f) => f.endsWith('.jsonl'));
            const filesWithTime = await Promise.all(
                jsonlFiles.map(async (f) => ({
                    name: f,
                    time: (await fs.promises.stat(path.join(agentDir, f))).mtimeMs,
                }))
            );
            const files = filesWithTime.sort((a, b) => b.time - a.time);

            if (files.length > 0) {
                const mtime = files[0].time;
                const lines = (await fs.promises.readFile(path.join(agentDir, files[0].name), 'utf8')).trim().split('\n');
                const isExecuting = Date.now() - mtime < 300000;
                let found = false;
                for (const roleFilter of ['assistant', null]) {
                    for (let i = lines.length - 1; i >= 0 && i >= lines.length - 30; i--) {
                        try {
                            const logObj = JSON.parse(lines[i]);
                            const msgObj = logObj.message || logObj;
                            if (roleFilter && msgObj.role !== roleFilter) continue;
                            if (msgObj.role === 'toolResult' || msgObj.role === 'user') continue;
                            let content = '';
                            if (msgObj.content && Array.isArray(msgObj.content)) {
                                content = msgObj.content.filter((c) => c.type === 'text').map((c) => c.text).join(' ').trim();
                            } else if (typeof msgObj.content === 'string') {
                                content = msgObj.content.trim();
                            }
                            if (content) {
                                detail.currentTask = { label: isExecuting ? 'EXECUTING' : 'IDLE', task: content.substring(0, 2000) };
                                found = true;
                                break;
                            }
                        } catch (e) {
                            // Session JSONL may contain partial or malformed lines; skip them.
                        }
                    }
                    if (found) break;
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
        logger.warn('agent_activity_read_failed', { agentId, msg: e.message });
        return detail;
    }
}

async function buildSubagentStatus() {
    const subagents = [];
    try {
        const agentDirs = await fs.promises.readdir(AGENTS_ROOT);
        for (const agentDirName of agentDirs) {
            const sessionsPath = path.join(AGENTS_ROOT, agentDirName, 'sessions', 'sessions.json');
            try {
                await fs.promises.access(sessionsPath);
            } catch {
                continue;
            }
            let sessions;
            try {
                sessions = JSON.parse(await fs.promises.readFile(sessionsPath, 'utf8'));
            } catch (e) {
                logger.warn('subagent_sessions_parse_failed', { agentDirName, msg: e.message });
                continue;
            }

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
                    key: sessionKey,
                    ownerAgent: parts[1] || agentDirName,
                    subagentId: parts[3] || 'unknown',
                    status,
                    updatedAt,
                    createdAt,
                    duration: durationMs > 0 ? `${Math.floor(durationMs / 1000)}s` : null,
                    lastActivity: minutesAgo === null ? 'unknown' : (minutesAgo < 1 ? 'just now' : `${minutesAgo}m ago`),
                    tokens: Number(meta?.totalTokens || 0),
                    abortedLastRun: !!meta?.abortedLastRun,
                    label: meta?.label || meta?.model || 'Sub-Agent Task',
                    model: meta?.model || 'unknown',
                });
            }
        }
    } catch (e) {
        logger.warn('subagent_status_build_failed', { msg: e.message });
    }
    const rank = { running: 0, recent: 1, idle: 2 };
    subagents.sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9) || (a.minutesAgo ?? 999999) - (b.minutesAgo ?? 999999));
    return subagents;
}

async function buildDashboardPayload() {
    const ocBin = await resolveOpenclawBin();

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
        sys: cache.sys.data || {},
        agents: cache.agents.data || [],
        cron: cache.cron.data || [],
        subagents: cache.subagents.data || [],
        cooldowns: cache.cooldowns.data || {},
        exchangeRate,
    };
}

function minimizeDashboardPayload(payload) {
    const safeAgents = Array.isArray(payload.agents) ? payload.agents.map((a) => {
        const safeWorkspace = a && a.workspace ? '[REDACTED_WORKSPACE]' : a.workspace;
        const safeCurrentTask = a && a.currentTask ? {
            ...a.currentTask,
            task: maskSensitivePaths(String(a.currentTask.task || '')),
        } : a.currentTask;
        return { ...a, workspace: safeWorkspace, currentTask: safeCurrentTask };
    }) : [];
    return { ...payload, agents: safeAgents };
}

async function doUpdateSharedData() {
    try {
        const payload = await buildDashboardPayload();
        sharedPayload = minimizeDashboardPayload(payload);
        lastUpdateTs = Date.now();

        if (lastUpdateTs - lastSnapshotTime >= TSDB_SNAPSHOT_INTERVAL) {
            lastSnapshotTime = lastUpdateTs;
            tsdbService.saveSnapshot(sharedPayload.sys || {}, sharedPayload.agents || []);
        }

        const firedAlerts = alertEngine.evaluate(sharedPayload);
        if (firedAlerts.length > 0) {
            const alertStr = `event: alert\ndata: ${JSON.stringify({ alerts: firedAlerts })}\n\n`;
            sseClients.forEach((client) => {
                try { client.write(alertStr); } catch (e) { sseClients.delete(client); }
            });
        }

        return true;
    } catch (e) {
        logger.error('poller_update_failed', { msg: e.message });
        return false;
    }
}

async function updateSharedData() {
    if (pendingUpdate) return pendingUpdate;
    pendingUpdate = doUpdateSharedData().finally(() => { pendingUpdate = null; });
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
    let watcherDebounceTimer = null;
    agentWatcherService.on('state_update', () => {
        clearTimeout(watcherDebounceTimer);
        watcherDebounceTimer = setTimeout(async () => {
            invalidateCache(cache.agents);
            invalidateCache(cache.subagents);
            await updateSharedData();
            doBroadcast().catch((e) => logger.error('poller_broadcast_error', { msg: e.message }));
        }, 300);
    });

    setInterval(async () => {
        await updateSharedData();
        doBroadcast().catch((e) => logger.error('poller_broadcast_error', { msg: e.message }));
    }, pollingConfig.pollingIntervalMs).unref();

    updateSharedData().catch((e) => logger.error('poller_update_failed', { msg: e.message }));
}

function addSseClient(res) {
    sseClients.add(res);
}

function removeSseClient(res) {
    sseClients.delete(res);
}

function invalidateSharedPayload() {
    sharedPayload = null;
    lastUpdateTs = 0;
    Object.values(cache).forEach(entry => invalidateCache(entry));
}

function getSharedPayload() {
    return sharedPayload;
}

function shouldRefreshSharedPayload(maxAgeMs = 5000) {
    return !sharedPayload || Date.now() - lastUpdateTs > maxAgeMs;
}

async function runOpenclawRead(args) {
    const ocBin = await resolveOpenclawBin();
    return execFilePromise(ocBin, args);
}

module.exports = {
    updateSharedData,
    startGlobalPolling,
    addSseClient,
    removeSseClient,
    invalidateSharedPayload,
    getSharedPayload,
    shouldRefreshSharedPayload,
    runOpenclawRead,
};
