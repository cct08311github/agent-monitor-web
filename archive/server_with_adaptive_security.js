#!/usr/bin/env node

const express = require('express');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');

const execPromise = util.promisify(exec);
const app = express();
const PORT = 3000;

// 導入安全系統
const ThreatIntelligence = require('./threat_intelligence_fixed');
const AdaptiveSecurity = require('./adaptive_security_simple');

// 中間件
app.use(express.static(path.join(__dirname), {
  setHeaders: (res, path) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
  }
}));
app.use(express.json());

// 初始化系統
const threatIntel = new ThreatIntelligence();
const adaptiveSecurity = new AdaptiveSecurity(threatIntel);

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

// API 端點：獲取所有 agent 狀態
app.get('/api/agents', async (req, res) => {
  try {
    const agentsText = await getOpenClawData('openclaw agents list', false);
    const agentsList = parseAgentsList(agentsText || '');
    
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

// 威脅情報 API
app.post('/api/threats/analyze', (req, res) => {
  try {
    const { content, context } = req.body;
    
    if (!content) {
      return res.status(400).json({
        success: false,
        error: '缺少內容參數'
      });
    }
    
    const analysis = threatIntel.analyze(content);
    
    res.json({
      success: true,
      ...analysis
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 自適應安全 API
app.post('/api/security/analyze', (req, res) => {
  try {
    const { content, context } = req.body;
    
    if (!content) {
      return res.status(400).json({
        success: false,
        error: '缺少內容參數'
      });
    }
    
    const result = adaptiveSecurity.analyze(content, context || {});
    
    res.json({
      success: true,
      ...result
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/api/security/level', (req, res) => {
  try {
    const { level, reason } = req.body;
    
    const validLevels = ['low', 'medium', 'high', 'critical'];
    if (!level || !validLevels.includes(level)) {
      return res.status(400).json({
        success: false,
        error: '無效的安全級別',
        validLevels: validLevels
      });
    }
    
    const adjusted = adaptiveSecurity.adjustLevel(level, reason || '手動調整');
    
    res.json({
      success: true,
      adjusted: adjusted,
      currentLevel: adaptiveSecurity.currentLevel,
      levelInfo: adaptiveSecurity.getLevelInfo(),
      systemStatus: adaptiveSecurity.getStatus()
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/security/status', (req, res) => {
  try {
    res.json({
      success: true,
      ...adaptiveSecurity.getStatus()
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 安全學習 API（整合安全檢查）
app.get('/api/learn/search', (req, res) => {
  const query = req.query.q;
  if (!query) {
    return res.status(400).json({ success: false, error: '缺少查詢參數' });
  }
  
  // 先進行安全分析
  const securityAnalysis = adaptiveSecurity.analyze(query, { source: 'learning_query' });
  
  // 如果發現高風險，返回警告
  if (securityAnalysis.riskScore > 0.7) {
    return res.json({
      success: true,
      query: query,
      securityWarning: true,
      securityAnalysis: securityAnalysis,
      results: [{
        title: '安全警告 - 查詢風險過高',
        content: '您的查詢被識別為高風險，已進行安全分析。',
        securityLevel: 'warning'
      }]
    });
  }
  
  // 正常學習結果
  const results = {
    query: query,
    timestamp: new Date().toISOString(),
    securityLevel: adaptiveSecurity.currentLevel,
    results: [{
      title: '安全學習示範',
      content: '這是安全學習系統的示範結果。',
      securityLevel: 'verified'
    }]
  };
  
  res.json({ success: true, ...results });
});

// 健康檢查
app.get('/api/health', (req, res) => {
  const threatStatus = threatIntel.getStatus();
  const securityStatus = adaptiveSecurity.getStatus();
  
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '2.4.0',
    features: [
      '真實活動檢測',
      '智能狀態分類', 
      '威脅情報集成',
      '自適應安全系統',
      '安全學習管道'
    ],
    security: {
      currentLevel: securityStatus.currentLevel,
      levelInfo: securityStatus.levelInfo,
      threatRules: threatStatus.rules,
      lastUpdate: threatStatus.lastUpdate
    }
  });
});

// 完整系統狀態
app.get('/api/system/status', (req, res) => {
  try {
    const threatStatus = threatIntel.getStatus();
    const securityStatus = adaptiveSecurity.getStatus();
    
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      components: {
        monitoring: { status: 'operational', version: '2.4.0' },
        threatIntelligence: { 
          status: threatStatus.operational ? 'operational' : 'degraded',
          rules: threatStatus.rules,
          lastUpdate: threatStatus.lastUpdate
        },
        adaptiveSecurity: {
          status: 'operational',
          currentLevel: securityStatus.currentLevel,
          levelInfo: securityStatus.levelInfo,
          historyCount: securityStatus.historyCount
        }
      },
      securityLevel: securityStatus.currentLevel,
      recommendations: [
        '定期更新威脅情報規則',
        '監控自適應安全級別變化',
        '檢查安全學習結果'
      ]
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 啟動伺服器
app.listen(PORT, () => {
  const securityStatus = adaptiveSecurity.getStatus();
  
  console.log('🔍 Agent 監控系統運行中...');
  console.log(`🌐 請在瀏覽器打開: http://localhost:${PORT}`);
  console.log(`🚀 版本: 2.4.0 (自適應安全系統)`);
  console.log(`✨ 功能:`);
  console.log(`   • ✅ 真實活動檢測`);
  console.log(`   • ✅ 智能狀態分類`);
  console.log(`   • 🔒 威脅情報集成 (${threatIntel.getStatus().rules} 條規則)`);
  console.log(`   • 🛡️ 自適應安全系統 (${securityStatus.levelInfo.emoji} ${securityStatus.levelInfo.label})`);
  console.log(`   • 📚 安全學習管道`);
  console.log(`🛡️ 當前安全級別: ${securityStatus.levelInfo.emoji} ${securityStatus.levelInfo.label}`);
});