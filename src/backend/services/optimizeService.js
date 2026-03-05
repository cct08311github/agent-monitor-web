// src/backend/services/optimizeService.js
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

const PROJECT_PATH = path.join(os.homedir(), '.openclaw', 'shared', 'projects', 'agent-monitor-web');
const PLANS_DIR = path.join(PROJECT_PATH, 'docs', 'plans');
const OPENCLAW_PATH = path.join(os.homedir(), '.openclaw', 'bin', 'openclaw');

const tsdbService = require('./tsdbService');
const alertEngine = require('./alertEngine');
const openclawService = require('./openclawService');

async function collectData() {
    const [costHistory, agents, alerts] = await Promise.all([
        Promise.resolve(tsdbService.getCostHistory ? tsdbService.getCostHistory(60) : []).catch(() => []),
        openclawService.listAgents().catch(() => []),
        Promise.resolve(alertEngine.getRecent(50)),
    ]);

    let existingPlans = [];
    try {
        existingPlans = fs.readdirSync(PLANS_DIR)
            .filter(f => f.endsWith('.md'))
            .sort()
            .reverse()
            .slice(0, 20);
    } catch (_) {}

    return { costHistory, agents, alerts, existingPlans };
}

module.exports = { collectData, PROJECT_PATH, OPENCLAW_PATH };
