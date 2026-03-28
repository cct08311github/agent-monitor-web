'use strict';

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const { calculateCost, isToday, isThisWeek, isThisMonth } = require('./costCalculationService');

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

async function detectDetailedActivity(agentId, agentsRoot) {
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
        const agentDir = path.join(agentsRoot, agentId, 'sessions');
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

async function buildSubagentStatus(agentsRoot) {
    const subagents = [];
    try {
        const agentDirs = await fs.promises.readdir(agentsRoot);
        for (const agentDirName of agentDirs) {
            const sessionsPath = path.join(agentsRoot, agentDirName, 'sessions', 'sessions.json');
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

module.exports = { parseAgentsList, detectDetailedActivity, buildSubagentStatus };
