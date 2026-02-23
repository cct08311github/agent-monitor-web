#!/usr/bin/env node

/**
 * OpenClaw HUD server (Phase-1 hardened)
 *
 * Notes:
 * - Read endpoints live under /api/read/*
 * - Control endpoints live under /api/control/*
 * - Legacy endpoints /api/dashboard and /api/command remain for backward compatibility (deprecated)
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { exec } = require('child_process');
const util = require('util');

const execPromise = util.promisify(exec);
const app = express();
const PORT = 3001;
const BUTLER_GROUP_ID = '-1003873859338';

// Lightweight cache for expensive dashboard assembly
const DASHBOARD_CACHE_TTL_MS = 5000;
let dashboardCache = { ts: 0, payload: null };

// 模型定價表
const PRICING = {
  'gpt-5.3-codex': 15,
  'gpt-5.2': 10,
  'gemini-3': 0.5,
  'deepseek-chat': 0.2,
  'minimax-m2.5': 1.2,
  'default': 1
};

// ---- Phase-1 Security Configuration ----

const CONTROL_RATE_LIMIT_PER_MINUTE = 30;
const CONTROL_TOKEN_ENV = process.env.HUD_CONTROL_TOKEN || process.env.OPENCLAW_HUD_CONTROL_TOKEN || '';

/**
 * Control auth modes:
 * 1) Token mode: set HUD_CONTROL_TOKEN/OPENCLAW_HUD_CONTROL_TOKEN
 * 2) Password-hash mode (default here): compare Bearer secret SHA-256 with fixed hash
 */
const CONTROL_TOKEN = String(CONTROL_TOKEN_ENV || '').trim();
// sha256('810778')
const CONTROL_PASSWORD_HASH = '6b277d013fa68756e3c4cd0fe34f13c8deee437e939487e5c1f5ac5774db91b8';

if (CONTROL_TOKEN) {
  console.warn('[hud] Using token mode for control endpoints (from env).');
} else {
  console.warn('[hud] Using password-hash mode for control endpoints.');
}

app.disable('x-powered-by');
app.set('etag', true);
app.use(express.static(path.join(__dirname), {
  maxAge: '5m',
  etag: true,
  lastModified: true,
}));
app.use(express.json({ limit: '256kb' }));

/**
 * @param {string} token
 * @returns {string} short actor id derived from the token
 */
function tokenHashPrefix(token) {
  try {
    const h = crypto.createHash('sha256').update(String(token), 'utf8').digest('hex');
    return h.slice(0, 10);
  } catch (e) {
    console.error('[hud] tokenHashPrefix failed:', e);
    return 'unknown';
  }
}

/**
 * @param {express.Request} req
 * @returns {string}
 */
function getClientIp(req) {
  // trust proxy is not enabled; Express will use direct remoteAddress.
  // keep it simple and explicit.
  const ip = (req.ip || req.connection?.remoteAddress || '').toString();
  return ip;
}

/**
 * Localhost-only Origin/Host checks (control endpoints only).
 *
 * - If Origin exists, it must be localhost/127.0.0.1/::1
 * - Host must be localhost/127.0.0.1/::1
 */
function localhostOnlyControl(req, res, next) {
  const hostHeader = (req.headers.host || '').toString().toLowerCase();
  const origin = (req.headers.origin || '').toString().toLowerCase();

  // Allow local machine + trusted LAN access points
  const ALLOWED_HOST_PREFIXES = [
    'localhost',
    '127.0.0.1',
    '[::1]',
    '::1',
    '192.168.0.198',
    'shenghuoguanjiademac-mini.local',
    'qiujuntingdeimac.local',
  ];

  const isLocalHostHeader = (value) => {
    if (!value) return false;
    // host header may include port.
    return ALLOWED_HOST_PREFIXES.some((prefix) => value.startsWith(prefix));
  };

  if (!isLocalHostHeader(hostHeader)) {
    return res.status(403).json({
      success: false,
      error: 'forbidden_host',
      message: 'Control endpoints are restricted to localhost Host header.'
    });
  }

  if (origin) {
    // Origin is a full URL like http://localhost:3001
    const allowedOriginFragments = [
      '://localhost',
      '://127.0.0.1',
      '://[::1]',
      '://::1',
      '://192.168.0.198',
      '://shenghuoguanjiademac-mini.local',
      '://qiujuntingdeimac.local',
    ];
    const isLocalOrigin = allowedOriginFragments.some((f) => origin.includes(f));
    if (!isLocalOrigin) {
      return res.status(403).json({
        success: false,
        error: 'forbidden_origin',
        message: 'Control endpoints are restricted to trusted local/LAN origins.'
      });
    }
  }

  return next();
}

/**
 * Require Authorization: Bearer <token> for control endpoints.
 */
function requireBearerToken(req, res, next) {
  const auth = (req.headers.authorization || '').toString();
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) {
    return res.status(401).json({ success: false, error: 'unauthorized', message: 'Missing Bearer token.' });
  }
  const token = m[1].trim();
  if (!token) {
    return res.status(401).json({ success: false, error: 'unauthorized', message: 'Invalid Bearer token.' });
  }

  let ok = false;
  if (CONTROL_TOKEN) {
    ok = (token === CONTROL_TOKEN);
  } else {
    const tokenHash = crypto.createHash('sha256').update(token, 'utf8').digest('hex');
    ok = (tokenHash === CONTROL_PASSWORD_HASH);
  }

  if (!ok) {
    return res.status(401).json({ success: false, error: 'unauthorized', message: 'Invalid Bearer token.' });
  }

  // attach for audit logging
  req._actorToken = token;
  return next();
}

/**
 * Simple in-memory sliding window rate limiter (per IP).
 * Control endpoints only.
 */
function makeRateLimiter({ limitPerMinute }) {
  const buckets = new Map();

  return function rateLimit(req, res, next) {
    const ip = getClientIp(req) || 'unknown';
    const now = Date.now();
    const windowMs = 60_000;

    const entry = buckets.get(ip) || { ts: [], lastGc: now };
    // keep timestamps inside window
    entry.ts = entry.ts.filter((t) => now - t < windowMs);
    entry.ts.push(now);

    // occasional GC to prevent unbounded growth
    if (now - entry.lastGc > 10 * windowMs) {
      entry.lastGc = now;
      // drop very old IP entries
      for (const [k, v] of buckets.entries()) {
        const newest = v.ts[v.ts.length - 1] || 0;
        if (now - newest > 30 * windowMs) buckets.delete(k);
      }
    }

    buckets.set(ip, entry);

    if (entry.ts.length > limitPerMinute) {
      return res.status(429).json({
        success: false,
        error: 'rate_limited',
        message: `Too many requests. Limit is ${limitPerMinute}/minute per IP.`
      });
    }

    return next();
  };
}

const controlRateLimit = makeRateLimiter({ limitPerMinute: CONTROL_RATE_LIMIT_PER_MINUTE });

/**
 * Append an audit record to logs/audit-YYYY-MM-DD.jsonl
 * @param {object} record
 */
function appendAuditLog(record) {
  try {
    const logsDir = path.join(__dirname, 'logs');
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

    const date = new Date();
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const filePath = path.join(logsDir, `audit-${y}-${m}-${d}.jsonl`);

    fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`, 'utf8');
  } catch (e) {
    console.error('[hud] Failed to write audit log:', e);
  }
}

/**
 * Audit logger for all /api/control/* calls (including 401/403).
 *
 * Fields:
 *  - ts
 *  - actor (token hash prefix, or 'missing')
 *  - ip
 *  - endpoint
 *  - command
 *  - statusCode
 *  - latencyMs
 *  - success
 */
function controlAuditMiddleware(req, res, next) {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    try {
      const end = process.hrtime.bigint();
      const latencyMs = Number(end - start) / 1e6;
      const ip = getClientIp(req);

      const auth = (req.headers.authorization || '').toString();
      const m = auth.match(/^Bearer\s+(.+)$/i);
      const token = m ? m[1].trim() : '';
      const actor = token ? tokenHashPrefix(token) : 'missing';

      const command = (req.body && typeof req.body.command === 'string') ? req.body.command : undefined;
      const statusCode = res.statusCode || 200;
      const success = statusCode >= 200 && statusCode < 300;

      appendAuditLog({
        ts: new Date().toISOString(),
        actor,
        ip,
        endpoint: req.originalUrl || req.url,
        command,
        statusCode,
        latencyMs: Math.round(latencyMs),
        success
      });
    } catch (e) {
      console.error('[hud] controlAuditMiddleware failed:', e);
    }
  });

  return next();
}

// ---- Data minimization helpers (read endpoints) ----

const SENSITIVE_PATH_PREFIXES = [
  '/Users/openclaw/.openclaw',
  '/Users/openclaw',
];

/**
 * Mask known sensitive absolute paths.
 * @param {string} input
 * @returns {string}
 */
function maskSensitivePaths(input) {
  if (typeof input !== 'string' || !input) return input;
  let out = input;
  for (const prefix of SENSITIVE_PATH_PREFIXES) {
    out = out.split(prefix).join('[REDACTED_PATH]');
  }
  return out;
}

/**
 * @param {string} input
 * @param {number} maxLen
 * @returns {string}
 */
function truncate(input, maxLen) {
  if (typeof input !== 'string') return '';
  if (input.length <= maxLen) return input;
  return input.slice(0, Math.max(0, maxLen - 1)) + '…';
}

/**
 * Create a minimized dashboard payload.
 * Keeps structure but masks sensitive fields.
 * @param {{success:boolean, sys:any, agents:any[], cron:any[]}} payload
 */
function minimizeDashboardPayload(payload) {
  const safeAgents = Array.isArray(payload.agents) ? payload.agents.map((a) => {
    const safeWorkspace = a && a.workspace ? '[REDACTED_WORKSPACE]' : a.workspace;
    const safeCurrentTask = a && a.currentTask ? {
      ...a.currentTask,
      task: truncate(maskSensitivePaths(String(a.currentTask.task || '')), 120)
    } : a.currentTask;

    return {
      ...a,
      workspace: safeWorkspace,
      currentTask: safeCurrentTask,
    };
  }) : [];

  return {
    ...payload,
    agents: safeAgents,
  };
}

// 獲取系統資源
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
    } catch (e) {
      // ignore disk usage probe errors
    }
    return { cpu: parseFloat(cpuUsage), memory: parseFloat(memUsage), disk: parseFloat(diskUsage), uptime: Math.floor(os.uptime() / 3600) + 'h' };
  } catch (e) {
    return { cpu: 0, memory: 0, disk: 0, uptime: '0h' };
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

function detectDetailedActivity(agentId, workspacePath) {
  let detail = { status: 'inactive', cost: 0, lastActivity: 'never', tokens: { input: 0, output: 0, total: 0 }, currentTask: { label: 'Idle', task: '' } };
  try {
    const agentDir = path.join('/Users/openclaw/.openclaw/agents', agentId, 'sessions');
    const sessionJsonPath = path.join(agentDir, 'sessions.json');
    if (fs.existsSync(sessionJsonPath)) {
      const json = JSON.parse(fs.readFileSync(sessionJsonPath, 'utf8'));
      Object.keys(json).forEach(k => {
        const s = json[k];
        detail.tokens.input += (s.inputTokens || 0);
        detail.tokens.output += (s.outputTokens || 0);
      });
      detail.tokens.total = detail.tokens.input + detail.tokens.output;
      const priceKey = Object.keys(PRICING).find(p => agentId.includes(p)) || 'default';
      detail.cost = (detail.tokens.total / 1000000 * PRICING[priceKey]).toFixed(4);
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
          } catch (e) {
            // ignore parse issues
          }
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
      } catch (e) {
        console.error('[hud] Failed to parse sessions file:', sessionsPath, e);
        continue;
      }

      for (const [sessionKey, meta] of Object.entries(sessions)) {
        if (!sessionKey.includes(':subagent:')) continue;

        const updatedAt = Number(meta?.updatedAt || 0);
        const minutesAgo = updatedAt > 0 ? Math.floor((Date.now() - updatedAt) / 60000) : null;
        const totalTokens = Number(meta?.totalTokens || meta?.inputTokens || 0) + Number(meta?.outputTokens || 0);

        let status = 'idle';
        if (minutesAgo !== null && minutesAgo <= 5) status = 'running';
        else if (minutesAgo !== null && minutesAgo <= 60) status = 'recent';

        // Parse key format: agent:<agentId>:subagent:<uuid>
        const parts = sessionKey.split(':');
        const ownerAgent = parts[1] || 'unknown';
        const subagentId = parts[3] || 'unknown';

        subagents.push({
          key: sessionKey,
          ownerAgent,
          subagentId,
          status,
          minutesAgo,
          lastActivity: minutesAgo === null ? 'unknown' : `${minutesAgo}m ago`,
          tokens: totalTokens,
          abortedLastRun: !!meta?.abortedLastRun,
        });
      }
    }
  } catch (e) {
    console.error('[hud] buildSubagentStatus failed:', e);
  }

  // Sort: running first, then recent, then idle; newest first within group
  const rank = { running: 0, recent: 1, idle: 2 };
  subagents.sort((a, b) => {
    const ra = rank[a.status] ?? 9;
    const rb = rank[b.status] ?? 9;
    if (ra !== rb) return ra - rb;
    const ma = a.minutesAgo ?? 999999;
    const mb = b.minutesAgo ?? 999999;
    return ma - mb;
  });

  return subagents;
}

async function buildDashboardPayload() {
  const now = Date.now();
  if (dashboardCache.payload && now - dashboardCache.ts < DASHBOARD_CACHE_TTL_MS) {
    return dashboardCache.payload;
  }

  const [sys, agentsResult, cronResult] = await Promise.all([
    getSystemResources(),
    execPromise('openclaw agents list').catch(() => ({ stdout: '' })),
    execPromise('openclaw cron list --json').catch(() => ({ stdout: '{"jobs":[]}' })),
  ]);

  const agents = parseAgentsList(agentsResult.stdout || '').map(a => ({ ...a, ...detectDetailedActivity(a.id, a.workspace) }));

  let cronJobs = [];
  try {
    const parsedCron = JSON.parse(cronResult.stdout || '{"jobs":[]}');
    cronJobs = Array.isArray(parsedCron.jobs) ? parsedCron.jobs : [];
  } catch (e) {
    cronJobs = [];
  }

  const cron = cronJobs.map(j => ({
    id: j.id,
    name: j.name,
    enabled: j.enabled !== false,
    next: j.state?.nextRunAtMs,
    status: j.state?.lastStatus || 'ok',
    lastRunAt: j.state?.lastRunAtMs,
    lastError: j.state?.lastError || ''
  }));

  const subagents = buildSubagentStatus();
  const payload = { success: true, sys, agents, cron, subagents };

  dashboardCache = { ts: now, payload };
  return payload;
}

// ------------------- Read APIs -------------------

app.get('/api/read/health', (req, res) => {
  res.json({ success: true, ts: new Date().toISOString(), uptimeSec: Math.floor(os.uptime()) });
});

app.get('/api/read/dashboard', async (req, res) => {
  try {
    const payload = await buildDashboardPayload();
    res.json(minimizeDashboardPayload(payload));
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/read/status', async (req, res) => {
  try {
    const { stdout, stderr } = await execPromise(`${OPENCLAW_PATH} status`);
    res.json({ success: true, output: (stdout || '') + (stderr || '') });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, output: (error.stdout || '') + (error.stderr || '') });
  }
});

app.get('/api/read/models', async (req, res) => {
  try {
    const { stdout, stderr } = await execPromise(`${OPENCLAW_PATH} models status`);
    res.json({ success: true, output: (stdout || '') + (stderr || '') });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, output: (error.stdout || '') + (error.stderr || '') });
  }
});

app.get('/api/read/agents', async (req, res) => {
  try {
    const { stdout, stderr } = await execPromise(`${OPENCLAW_PATH} agents list`);
    res.json({ success: true, output: (stdout || '') + (stderr || '') });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, output: (error.stdout || '') + (error.stderr || '') });
  }
});

// ------------------- Legacy APIs (deprecated) -------------------

/**
 * @deprecated Use GET /api/read/dashboard
 */
app.get('/api/dashboard', async (req, res) => {
  try {
    const payload = await buildDashboardPayload();
    // Keep legacy behavior as compatible as possible (no minimization here).
    res.json(payload);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ------------------- Control APIs -------------------

const controlRouter = express.Router();
controlRouter.use(controlAuditMiddleware);
controlRouter.use(localhostOnlyControl);
controlRouter.use(controlRateLimit);
controlRouter.use(requireBearerToken);

const OPENCLAW_PATH = '/opt/homebrew/bin/openclaw';

const LOW_RISK_ALLOWLIST = new Set(['status', 'talk', 'notion_sync']);
const HIGH_RISK_COMMANDS = new Set(['restart', 'update', 'cron', 'cron_add', 'cron_remove', 'cron_update', 'cron_enable', 'cron_disable']);
const HIGH_RISK_ALLOWLIST = new Set(['restart', 'update']);

/**
 * POST /api/control/command
 * Body:
 *  - command: 'status' | 'talk'
 *  - agentId?: string (required for talk)
 *  - message?: string (required for talk)
 */
controlRouter.post('/command', async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const command = typeof body.command === 'string' ? body.command.trim() : '';

  if (!command) {
    return res.status(400).json({ success: false, error: 'bad_request', message: 'Missing command.' });
  }

  if (!LOW_RISK_ALLOWLIST.has(command) && !HIGH_RISK_ALLOWLIST.has(command)) {
    return res.status(403).json({
      success: false,
      error: 'command_not_allowed',
      reason: 'not_in_allowlist',
      message: `Command '${command}' is not allowlisted. Allowed: ${Array.from(new Set([...LOW_RISK_ALLOWLIST, ...HIGH_RISK_ALLOWLIST])).join(', ')}`
    });
  }

  if (HIGH_RISK_COMMANDS.has(command) && !HIGH_RISK_ALLOWLIST.has(command)) {
    return res.status(403).json({
      success: false,
      error: 'command_blocked',
      reason: 'high_risk',
      message: `Command '${command}' is blocked in phase-1 hardening.`
    });
  }

  // talk command
  if (command === 'talk') {
    const agentId = typeof body.agentId === 'string' ? body.agentId.trim() : '';
    const message = typeof body.message === 'string' ? body.message : '';

    if (!agentId || !message) {
      return res.status(400).json({ success: false, error: 'bad_request', message: 'talk requires agentId and message.' });
    }

    // Avoid extremely large shell payloads.
    if (message.length > 2000) {
      return res.status(400).json({ success: false, error: 'bad_request', message: 'message too long (max 2000 chars).' });
    }

    const safeMessage = message.replace(/"/g, '\\"');
    const talkCmd = `${OPENCLAW_PATH} agent --agent "${agentId}" --message "${safeMessage}" --no-color`;
    console.log(`Talking to Agent: ${talkCmd}`);

    try {
      const { stdout, stderr } = await execPromise(talkCmd);
      return res.json({ success: true, output: stdout || stderr });
    } catch (error) {
      console.error('[hud] talk command failed:', error);
      return res.status(500).json({ success: false, output: error.stdout || error.message });
    }
  }

  // high-risk commands with explicit confirmation
  if (command === 'restart' || command === 'update') {
    const confirmText = typeof body.confirmText === 'string' ? body.confirmText.trim() : '';
    const expected = command === 'restart' ? 'CONFIRM_RESTART' : 'CONFIRM_UPDATE';

    if (confirmText !== expected) {
      return res.status(400).json({
        success: false,
        error: 'confirmation_required',
        message: `Missing/invalid confirmation. Provide confirmText='${expected}'.`
      });
    }

    const cmd = command === 'restart' ? `${OPENCLAW_PATH} gateway restart` : `${OPENCLAW_PATH} update`;
    console.log(`Executing high-risk command: ${cmd}`);

    // Return immediately; run async to avoid blocking the request lifecycle.
    res.json({
      success: true,
      output: `COMMAND_ACCEPTED: ${command.toUpperCase()} started.`
    });

    setTimeout(() => {
      exec(cmd, (err) => {
        if (err) console.error(`[hud] ${command} failed:`, err.message);
      });
    }, 300);
    return;
  }

  // notion sync quick-recovery command
  if (command === 'notion_sync') {
    const syncCmd = `python3 /Users/openclaw/.openclaw/workspace-main/tools/smart_notion_sync.py`;
    console.log(`Executing: ${syncCmd}`);
    try {
      const { stdout, stderr } = await execPromise(syncCmd);
      return res.json({ success: true, output: (stdout || '') + (stderr || '') });
    } catch (error) {
      console.error('[hud] notion_sync command failed:', error);
      return res.status(500).json({ success: false, error: error.message, output: (error.stdout || '') + (error.stderr || '') });
    }
  }

  // status command
  if (command === 'status') {
    const statusCmd = `${OPENCLAW_PATH} status`;
    console.log(`Executing: ${statusCmd}`);
    try {
      const { stdout, stderr } = await execPromise(statusCmd);
      return res.json({ success: true, output: (stdout || '') + (stderr || '') });
    } catch (error) {
      console.error('[hud] status command failed:', error);
      return res.status(500).json({ success: false, error: error.message, output: (error.stdout || '') + (error.stderr || '') });
    }
  }

  // Should be unreachable due to allowlist
  return res.status(500).json({ success: false, error: 'internal_error', message: 'Unhandled command path.' });
});

app.use('/api/control', controlRouter);

/**
 * @deprecated Use POST /api/control/command
 */
app.post('/api/command', localhostOnlyControl, controlRateLimit, requireBearerToken, async (req, res) => {
  const { command, agentId, message } = req.body || {};

  // Legacy behavior retained as much as possible, but now protected by token/localhost/rate-limit.
  // NOTE: phase-1 guardrails recommend using /api/control/command for allowlisted commands only.

  // 處理對話請求
  if (command === 'talk' && agentId && message) {
    try {
      const talkCmd = `${OPENCLAW_PATH} agent --agent "${String(agentId).replace(/"/g, '\\"')}" --message "${String(message).replace(/"/g, '\\"')}" --no-color`;
      console.log(`Talking to Agent (legacy): ${talkCmd}`);
      const { stdout, stderr } = await execPromise(talkCmd);
      return res.json({ success: true, output: stdout || stderr });
    } catch (error) {
      console.error('[hud] legacy talk failed:', error);
      return res.status(500).json({ success: false, output: error.stdout || error.message });
    }
  }

  const whitelist = {
    'restart': `${OPENCLAW_PATH} gateway restart`,
    'models': `${OPENCLAW_PATH} models status`,
    'status': `${OPENCLAW_PATH} status`,
    'agents': `${OPENCLAW_PATH} agents list`,
    'update': `${OPENCLAW_PATH} update`,
    'test_alert': `${OPENCLAW_PATH} message send --channel telegram --target \"${BUTLER_GROUP_ID}\" --message \"🚨 【手動測試報警】系統狀態一切正常，指揮中心連線穩定。\"`
  };

  if (!whitelist[command]) {
    return res.status(403).json({ success: false, error: 'Unauthorized command' });
  }

  try {
    if (command === 'restart' || command === 'update') {
      const msg = command === 'restart' ? 'Restarting Gateway...' : 'Updating OpenClaw...';
      res.json({ success: true, output: `COMMAND_ACCEPTED: ${msg} Connection will drop.` });
      setTimeout(() => { exec(whitelist[command]); }, 500);
      return;
    }

    console.log(`Executing (legacy): ${whitelist[command]}`);
    const { stdout, stderr } = await execPromise(whitelist[command]);
    res.json({ success: true, output: (stdout || '') + (stderr || '') });
  } catch (error) {
    console.error(`Legacy Command Error: ${error.message}`);
    res.status(500).json({ success: false, error: error.message, output: (error.stdout || '') + (error.stderr || '') });
  }
});

app.listen(PORT, () => console.log(`🚀 Final CommandCenter v3.4 (hardened) on port ${PORT}`));
