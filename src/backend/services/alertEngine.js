const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '../../../data/alert-config.json');

const DEFAULT_CONFIG = {
    rules: {
        cpu_high:          { enabled: true, threshold: 80,  severity: 'warning',  label: 'CPU 偏高' },
        cpu_critical:      { enabled: true, threshold: 95,  severity: 'critical', label: 'CPU 危急' },
        memory_high:       { enabled: true, threshold: 85,  severity: 'warning',  label: '記憶體偏高' },
        no_active_agents:  { enabled: true, threshold: 0,   severity: 'critical', label: 'Agent 全部離線' },
        agent_went_offline:{ enabled: true, threshold: 0,   severity: 'info',     label: 'Agent 離線' },
    }
};

const COOLDOWN_MS = 5 * 60 * 1000;
const MAX_BUFFER = 50;

let config = loadConfig();
let cooldowns = {};
let alertsBuffer = [];
let prevActiveCount = -1;

function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
        }
    } catch (e) { /* use default */ }
    return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
}

function saveConfig() {
    try { fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2)); } catch (e) { /* ignore */ }
}

function getConfig() { return config; }

function updateConfig(patch) {
    for (const [rule, updates] of Object.entries(patch.rules || {})) {
        if (config.rules[rule]) Object.assign(config.rules[rule], updates);
    }
    saveConfig();
    return config;
}

function canFire(rule) {
    const now = Date.now();
    if (cooldowns[rule] && now - cooldowns[rule] < COOLDOWN_MS) return false;
    cooldowns[rule] = now;
    return true;
}

function fire(rule, message, severity, meta = {}) {
    const alert = { rule, severity, message, meta, ts: Date.now() };
    alertsBuffer.unshift(alert);
    if (alertsBuffer.length > MAX_BUFFER) alertsBuffer.pop();
    return alert;
}

function evaluate(payload) {
    const fired = [];
    const rules = config.rules;
    const sys = payload.sys || {};
    const agents = payload.agents || [];

    if (rules.cpu_critical?.enabled && sys.cpu > rules.cpu_critical.threshold && canFire('cpu_critical')) {
        fired.push(fire('cpu_critical', `CPU ${sys.cpu.toFixed(1)}% — 超過危急閾值 ${rules.cpu_critical.threshold}%`, 'critical', { cpu: sys.cpu }));
    } else if (rules.cpu_high?.enabled && sys.cpu > rules.cpu_high.threshold && canFire('cpu_high')) {
        fired.push(fire('cpu_high', `CPU ${sys.cpu.toFixed(1)}% — 超過警告閾值 ${rules.cpu_high.threshold}%`, 'warning', { cpu: sys.cpu }));
    }

    if (rules.memory_high?.enabled && sys.memory > rules.memory_high.threshold && canFire('memory_high')) {
        fired.push(fire('memory_high', `記憶體 ${sys.memory.toFixed(1)}% — 超過閾值 ${rules.memory_high.threshold}%`, 'warning', { memory: sys.memory }));
    }

    const activeNow = agents.filter(a => a.status?.includes('active')).length;
    if (prevActiveCount > 0 && activeNow === 0 && rules.no_active_agents?.enabled && canFire('no_active_agents')) {
        fired.push(fire('no_active_agents', '所有 Agent 已離線', 'critical', { prev: prevActiveCount }));
    }
    prevActiveCount = activeNow;

    return fired;
}

function getRecent(limit = 50) { return alertsBuffer.slice(0, limit); }

function resetForTesting() {
    cooldowns = {};
    alertsBuffer = [];
    prevActiveCount = -1;
    config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
}

module.exports = { evaluate, getConfig, updateConfig, getRecent, resetForTesting };
