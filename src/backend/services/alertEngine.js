const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '../../../data/alert-config.json');

const DEFAULT_CONFIG = {
    rules: {
        cpu_high:          { enabled: true, threshold: 80,  severity: 'warning',  label: 'CPU 偏高' },
        cpu_critical:      { enabled: true, threshold: 95,  severity: 'critical', label: 'CPU 危急' },
        memory_high:       { enabled: true, threshold: 85,  severity: 'warning',  label: '記憶體偏高' },
        no_active_agents:  { enabled: true, threshold: 0,   severity: 'critical', label: 'Agent 全部離線' },
        cost_today_high:   { enabled: true, threshold: 5,   severity: 'warning',  label: '今日成本偏高 (USD)' },
    }
};

const COOLDOWN_MS = 5 * 60 * 1000;
const MAX_BUFFER = 50;

let config = loadConfig();
let cooldowns = {};
let alertsBuffer = [];
let prevActiveCount = -1;
// Hysteresis latch for monotonically-increasing rules (cost_today_high).
// Avoids re-firing every cooldown window while still above threshold.
let costRuleState = {};

function loadConfig() {
    try {
        /* istanbul ignore next */
        if (fs.existsSync(CONFIG_PATH)) {
            return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
        }
    } catch (e) { /* use default */ }
    return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
}

function saveConfig() {
    try { fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2)); } catch (e) { /* istanbul ignore next */ } // disk errors
}

function getConfig() { return config; }

function updateConfig(patch) {
    for (const [rule, updates] of Object.entries(/* istanbul ignore next */ patch.rules || {})) {
        if (!config.rules[rule]) continue;
        if (typeof updates.enabled === 'boolean') config.rules[rule].enabled = updates.enabled;
        if (typeof updates.threshold === 'number' && isFinite(updates.threshold)) config.rules[rule].threshold = updates.threshold;
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

function fire(rule, message, severity, /* istanbul ignore next */ meta = {}) {
    const alert = { rule, severity, message, meta, ts: Date.now() };
    alertsBuffer.unshift(alert);
    /* istanbul ignore next */
    if (alertsBuffer.length > MAX_BUFFER) alertsBuffer.pop();
    return alert;
}

function evaluate(payload) {
    const fired = [];
    const rules = config.rules;
    /* istanbul ignore next */
    const sys = payload.sys || {};
    /* istanbul ignore next */
    const agents = payload.agents || [];

    /* istanbul ignore next */
    const cpu = typeof sys.cpu === 'number' ? sys.cpu : Number(sys.cpu);
    /* istanbul ignore next */
    const memory = typeof sys.memory === 'number' ? sys.memory : Number(sys.memory);

    if (rules.cpu_critical?.enabled && cpu > rules.cpu_critical.threshold && canFire('cpu_critical')) {
        fired.push(fire('cpu_critical', `CPU ${cpu.toFixed(1)}% — 超過危急閾值 ${rules.cpu_critical.threshold}%`, 'critical', { cpu }));
    } else if (rules.cpu_high?.enabled && cpu > rules.cpu_high.threshold && cpu <= (/* istanbul ignore next */ rules.cpu_critical?.threshold ?? Infinity) && canFire('cpu_high')) {
        fired.push(fire('cpu_high', `CPU ${cpu.toFixed(1)}% — 超過警告閾值 ${rules.cpu_high.threshold}%`, 'warning', { cpu }));
    }

    if (rules.memory_high?.enabled && memory > rules.memory_high.threshold && canFire('memory_high')) {
        fired.push(fire('memory_high', `記憶體 ${memory.toFixed(1)}% — 超過閾值 ${rules.memory_high.threshold}%`, 'warning', { memory }));
    }

    // Cost alert — hysteresis: fire once per crossing, reset when below threshold
    if (rules.cost_today_high?.enabled) {
        const todayCost = agents.reduce((sum, a) => sum + (a.costs?.today || 0), 0);
        const threshold = rules.cost_today_high.threshold;
        if (todayCost > threshold && !costRuleState.cost_today_high) {
            if (canFire('cost_today_high')) {
                fired.push(fire('cost_today_high',
                    `今日累積成本 $${todayCost.toFixed(2)} USD — 超過閾值 $${threshold.toFixed(2)}`,
                    'warning',
                    { todayCost, threshold }));
                costRuleState.cost_today_high = true;
            }
        } else if (todayCost <= threshold && costRuleState.cost_today_high) {
            costRuleState.cost_today_high = false;
        }
    }

    const activeNow = agents.filter(a => /* istanbul ignore next */ a.status?.includes('active')).length;
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
    costRuleState = {};
    config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    try { if (fs.existsSync(CONFIG_PATH)) fs.unlinkSync(CONFIG_PATH); } catch (e) { /* ignore */ }
}

module.exports = { evaluate, getConfig, updateConfig, getRecent, resetForTesting };
