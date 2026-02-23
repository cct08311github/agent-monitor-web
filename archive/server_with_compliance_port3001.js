#!/usr/bin/env node

const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { exec } = require('child_process');
const util = require('util');

const execPromise = util.promisify(exec);
const app = express();
const PORT = 3001;
const BUTLER_GROUP_ID = '-1003873859338'; // 管家群 (秘書群)

// 警報狀態紀錄 (冷卻機制)
let lastAlertTime = 0;
const ALERT_COOLDOWN = 60 * 60 * 1000; // 1小時冷卻

app.use(express.static(path.join(__dirname)));
app.use(express.json());

// 獲取系統資源數據
async function getSystemResources() {
  const cpus = os.cpus();
  const load = os.loadavg();
  const cpuUsage = (load[0] / cpus.length * 100).toFixed(1);
  
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const memUsage = ((totalMem - freeMem) / totalMem * 100).toFixed(1);
  
  let diskUsage = '0';
  try {
    const { stdout } = await execPromise("df -h / | tail -1 | awk '{print $5}' | sed 's/%//'");
    diskUsage = stdout.trim();
  } catch (e) { console.error('Disk read failed', e); }

  return {
    cpu: parseFloat(cpuUsage),
    memory: parseFloat(memUsage),
    disk: parseFloat(diskUsage),
    uptime: Math.floor(os.uptime() / 3600) + 'h'
  };
}

// Telegram 報警推送
async function sendTelegramAlert(message) {
  const now = Date.now();
  if (now - lastAlertTime < ALERT_COOLDOWN) return;
  
  try {
    const cmd = `openclaw message send --to "${BUTLER_GROUP_ID}" --message "🚨 【系統警報】\n${message}\n---\n來自: OpenClaw Monitor"`;
    await execPromise(cmd);
    lastAlertTime = now;
    console.log('Alert sent to Telegram');
  } catch (e) {
    console.error('Failed to send Telegram alert', e);
  }
}

// 數據解析邏輯 (保留並優化)
function parseAgentsList(text) {
  const agents = [];
  const lines = text.split('\n');
  let currentAgent = null;
  for (const line of lines) {
    const agentMatch = line.match(/^- (\w+)(?:\s+\(([^)]+)\))?/);
    if (agentMatch) {
      if (currentAgent) agents.push(currentAgent);
      currentAgent = { id: agentMatch[1], name: agentMatch[2] || agentMatch[1] };
    }
    if (currentAgent && line.includes('Model:')) {
      const match = line.match(/Model:\s+(.+)/);
      if (match) currentAgent.model = match[1].trim();
    }
    if (currentAgent && line.includes('Workspace:')) {
      const match = line.match(/Workspace:\s+(.+)/);
      if (match) currentAgent.workspace = match[1].trim();
    }
  }
  if (currentAgent) agents.push(currentAgent);
  return agents;
}

function detectDetailedActivity(agentId, workspacePath) {
  try {
    const fullPath = workspacePath.replace('~/.openclaw', '/Users/openclaw/.openclaw');
    const sessionPath = path.join('/Users/openclaw/.openclaw/agents', agentId, 'sessions/sessions.json');
    let latestModification = 0;
    let tokens = { input: 0, output: 0, total: 0 };
    let currentTask = { label: 'Idle', task: '' };

    if (fs.existsSync(sessionPath)) {
      const stats = fs.statSync(sessionPath);
      latestModification = stats.mtimeMs;
      const json = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
      if (json && json.sessions) {
        json.sessions.forEach(s => { tokens.input += (s.inputTokens || 0); tokens.output += (s.outputTokens || 0); });
        tokens.total = tokens.input + tokens.output;
        const latest = json.sessions.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
        if (latest && (Date.now() - (latest.updatedAt || 0) < 30 * 60 * 1000)) {
          currentTask = { label: latest.label || 'Active', task: latest.task || '' };
        }
      }
    }
    const minutesAgo = latestModification > 0 ? Math.floor((Date.now() - latestModification) / 60000) : 9999;
    let status = 'inactive';
    if (minutesAgo < 5) status = 'active_executing';
    else if (minutesAgo < 60) status = 'active_recent';
    else if (latestModification > 0) status = 'dormant';

    return { status, minutesAgo, tokens, currentTask };
  } catch (e) { return { status: 'error', tokens: {total:0}, currentTask: {label:'ERR'} }; }
}

// API: 綜合狀態
app.get('/api/dashboard', async (req, res) => {
  try {
    const sys = await getSystemResources();
    
    // 檢查報警
    let alertMsg = "";
    if (sys.cpu > 85) alertMsg += `⚠️ CPU 使用率過高: ${sys.cpu}%\n`;
    if (sys.memory > 90) alertMsg += `⚠️ 記憶體快滿了: ${sys.memory}%\n`;
    if (sys.disk > 95) alertMsg += `⚠️ 硬碟空間不足: ${sys.disk}%\n`;
    if (alertMsg) sendTelegramAlert(alertMsg);

    const { stdout: agentsText } = await execPromise('openclaw agents list');
    const agentsList = parseAgentsList(agentsText);
    const agents = agentsList.map(a => {
      const detail = detectDetailedActivity(a.id, a.workspace || '');
      return { ...a, ...detail };
    });

    const { stdout: cronText } = await execPromise('openclaw cron list --json');
    const cron = JSON.parse(cronText).jobs.map(j => ({
      name: j.name, enabled: j.enabled !== false, 
      next: j.state?.nextRunAtMs ? new Date(j.state.nextRunAtMs).toISOString() : null,
      status: j.state?.lastStatus || 'ok'
    }));

    res.json({ success: true, sys, agents, cron });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => console.log(`🚀 Extreme Monitor v3.0 on http://localhost:${PORT}`));
