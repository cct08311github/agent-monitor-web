#!/usr/bin/env node

const express = require('express');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');

const execPromise = util.promisify(exec);
const app = express();
const PORT = 3000;

// 中間件
app.use(express.static(path.join(__dirname), {
  setHeaders: (res, path) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
  }
}));
app.use(express.json());

// 執行 OpenClaw 命令
async function getOpenClawData(command, parseJson = true) {
  try {
    const { stdout } = await execPromise(command);
    return parseJson ? JSON.parse(stdout) : stdout;
  } catch (error) {
    console.error(`執行命令失敗: ${command}`, error.message);
    return parseJson ? {} : '';
  }
}

// 解析 Agent 列表文本
function parseAgentsList(text) {
  const agents = [];
  const lines = text.split('\n');
  let currentAgent = null;
  
  for (const line of lines) {
    const agentMatch = line.match(/^- (\w+)(?:\s+\(([^)]+)\))?/);
    if (agentMatch) {
      if (currentAgent) agents.push(currentAgent);
      currentAgent = {
        id: agentMatch[1],
        name: agentMatch[2] || agentMatch[1],
        workspace: null,
        model: null
      };
    }
    
    if (currentAgent && line.includes('Workspace:')) {
      const match = line.match(/Workspace:\s+(.+)/);
      if (match) currentAgent.workspace = match[1].trim();
    }
    
    if (currentAgent && line.includes('Model:')) {
      const match = line.match(/Model:\s+(.+)/);
      if (match) currentAgent.model = match[1].trim();
    }
  }
  
  if (currentAgent) agents.push(currentAgent);
  return agents;
}

// 真實活動檢測
function detectRealActivity(agentId, workspacePath) {
  const fs = require('fs');
  const path = require('path');
  
  try {
    const fullPath = workspacePath.replace('~/.openclaw', '/Users/openclaw/.openclaw');
    let latestModification = 0;
    
    const filesToCheck = [
      path.join(fullPath, 'SOUL.md'),
      path.join(fullPath, 'MEMORY.md'),
      path.join(fullPath, 'memory')
    ];
    
    for (const filePath of filesToCheck) {
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        latestModification = Math.max(latestModification, stats.mtimeMs);
      }
    }
    
    const now = Date.now();
    const minutesAgo = latestModification > 0 ? Math.floor((now - latestModification) / (60 * 1000)) : 9999;
    
    let status, emoji, label;
    if (minutesAgo < 5) {
      status = 'active_executing'; emoji = '🔥'; label = '執行中';
    } else if (minutesAgo < 30) {
      status = 'active_recent'; emoji = '✅'; label = '近期活動';
    } else if (minutesAgo < 120) {
      status = 'active_historical'; emoji = '⚠️'; label = '歷史活動';
    } else if (latestModification > 0) {
      status = 'dormant'; emoji = '💤'; label = '休眠中';
    } else {
      status = 'inactive'; emoji = '❌'; label = '離線';
    }
    
    return { status, emoji, label, minutesAgo };
    
  } catch (error) {
    return { status: 'error', emoji: '❓', label: '檢測錯誤', minutesAgo: 9999 };
  }
}

// API 端點
app.get('/api/agents', async (req, res) => {
  try {
    const agentsText = await getOpenClawData('openclaw agents list', false);
    const agentsList = parseAgentsList(agentsText || '');
    const sessionsList = await getOpenClawData('openclaw sessions list --json');
    
    const agents = [];
    
    for (const agent of agentsList) {
      const realActivity = detectRealActivity(agent.id, agent.workspace);
      
      agents.push({
        id: agent.id,
        name: agent.name || agent.id,
        status: realActivity.status,
        emoji: realActivity.emoji,
        label: realActivity.label,
        lastActivity: realActivity.minutesAgo < 9999 ? `${realActivity.minutesAgo}分鐘前` : '從未活動',
        model: agent.model || '未知',
        workspace: agent.workspace || '未知'
      });
    }
    
    // 計算統計
    const stats = {
      total: agents.length,
      executing: agents.filter(a => a.status === 'active_executing').length,
      recent: agents.filter(a => a.status === 'active_recent').length,
      historical: agents.filter(a => a.status === 'active_historical').length,
      dormant: agents.filter(a => a.status === 'dormant').length,
      inactive: agents.filter(a => a.status === 'inactive').length,
      error: agents.filter(a => a.status === 'error').length
    };
    
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      stats: stats,
      agents: agents
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 健康檢查
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '2.2.0',
    features: ['真實活動檢測', '智能狀態分類']
  });
});

// 安全學習 API（簡單版本）
app.get('/api/learn/search', (req, res) => {
  const query = req.query.q;
  if (!query) {
    return res.status(400).json({ success: false, error: '缺少查詢參數' });
  }
  
  // 模擬安全學習結果
  const results = {
    query: query,
    timestamp: new Date().toISOString(),
    results: [{
      title: '安全學習示範',
      content: '這是安全學習系統的示範結果。實際應整合安全搜索 API。',
      securityLevel: 'verified'
    }]
  };
  
  res.json({ success: true, ...results });
});

// 啟動伺服器
app.listen(PORT, () => {
  console.log('🔍 Agent 監控系統運行中...');
  console.log(`🌐 請在瀏覽器打開: http://localhost:${PORT}`);
  console.log(`🚀 版本: 2.2.0 (真實活動檢測 + 安全學習)`);
  console.log(`✨ 功能: 真實活動檢測、智能狀態分類、安全學習`);
});