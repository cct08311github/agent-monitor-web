'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const util = require('util');
const { execFile } = require('child_process');

const execFilePromise = util.promisify(execFile);
const logger = require('../utils/logger');
const { getDashboardPollingConfig } = require('../config');
const tsdbService = require('./tsdbService');
const agentWatcherService = require('./agentWatcherService');
const alertEngine = require('./alertEngine');
const { fetchModelCooldowns } = require('../utils/modelMonitor');

const { getSystemResources } = require('./systemResourceCollector');
const { getExchangeRate } = require('./costCalculationService');
const { parseAgentsList, detectDetailedActivity, buildSubagentStatus } = require('./agentActivityDetector');
const sseManager = require('./sseStreamManager');
const { createCacheManager } = require('./dashboardCacheManager');

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
const pollingConfig = getDashboardPollingConfig();
const TSDB_SNAPSHOT_INTERVAL = pollingConfig.tsdbSnapshotIntervalMs;

let RESOLVED_OPENCLAW_BIN = null;
let isPolling = false;
let lastSnapshotTime = 0;
let sharedPayload = null;
let lastUpdateTs = 0;
let pendingUpdate = null;
let cachedOcVersion = null;

const { cache, isFresh, update: updateCache, invalidate: invalidateCache, invalidateAll } = createCacheManager(pollingConfig);

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
                            const activity = await detectDetailedActivity(a.id, AGENTS_ROOT);
                            return { ...a, ...activity, model: a.model || activity.activeModel, activeModel: activity.activeModel };
                        })
                    );
                    updateCache(cache.agents, agents);
                })
        );
    }

    if (!isFresh(cache.subagents)) {
        fetches.push(
            buildSubagentStatus(AGENTS_ROOT).then(data => updateCache(cache.subagents, data))
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
        sseManager.broadcastAlert(firedAlerts);

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
    if (sseManager.getClientCount() === 0) return;
    if (!sharedPayload) await updateSharedData();
    sseManager.broadcast(sharedPayload);
}

let pollingTimer = null;
let watcherDebounceTimer = null;

function startGlobalPolling() {
    if (isPolling) return;
    isPolling = true;

    agentWatcherService.start();
    agentWatcherService.on('state_update', () => {
        clearTimeout(watcherDebounceTimer);
        watcherDebounceTimer = setTimeout(async () => {
            if (!isPolling) return;
            invalidateCache(cache.agents);
            invalidateCache(cache.subagents);
            try {
                await updateSharedData();
                doBroadcast().catch((e) => logger.error('poller_broadcast_error', { msg: e.message }));
            } catch (e) {
                logger.error('watcher_update_failed', { msg: e.message });
            }
        }, 300);
    });

    pollingTimer = setInterval(async () => {
        await updateSharedData();
        doBroadcast().catch((e) => logger.error('poller_broadcast_error', { msg: e.message }));
    }, pollingConfig.pollingIntervalMs);
    pollingTimer.unref();

    updateSharedData().catch((e) => logger.error('poller_update_failed', { msg: e.message }));
}

function stopGlobalPolling() {
    isPolling = false;
    if (pollingTimer) {
        clearInterval(pollingTimer);
        pollingTimer = null;
    }
    clearTimeout(watcherDebounceTimer);
    watcherDebounceTimer = null;
    agentWatcherService.removeAllListeners('state_update');
    agentWatcherService.stop();
}

function addSseClient(res) {
    return sseManager.addClient(res);
}

function removeSseClient(res) {
    sseManager.removeClient(res);
}

function startSseHeartbeat() {
    sseManager.startHeartbeat();
}

function invalidateSharedPayload() {
    sharedPayload = null;
    lastUpdateTs = 0;
    invalidateAll();
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
    stopGlobalPolling,
    addSseClient,
    removeSseClient,
    startSseHeartbeat,
    invalidateSharedPayload,
    getSharedPayload,
    shouldRefreshSharedPayload,
    runOpenclawRead,
};
