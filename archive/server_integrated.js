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
    // 匹配 agent 行
    const agentMatch = line.match(/^- (\w+)(?:\s+\(([^)]+)\))?/);
    if (agentMatch) {
      if (currentAgent) {
        agents.push(currentAgent);
      }
      currentAgent = {
        id: agentMatch[1],
        name: agentMatch[2] || agentMatch[1],
        workspace: null,
        model: null
      };
    }
    
    // 匹配 workspace
    if (currentAgent && line.includes('Workspace:')) {
      const workspaceMatch = line.match(/Workspace:\s+(.+)/);
      if (workspaceMatch) {
        currentAgent.workspace = workspaceMatch[1].trim();
      }
    }
    
    // 匹配 model
    if (currentAgent && line.includes('Model:')) {
      const modelMatch = line.match(/Model:\s+(.+)/);
      if (modelMatch) {
        currentAgent.model = modelMatch[1].trim();
      }
    }
  }
  
  if (currentAgent) {
    agents.push(currentAgent);
  }
  
  return agents;
}

// 真實活動檢測函數
function detectRealActivity(agentId, workspacePath) {
  const fs = require('fs');
  const path = require('path');
  
  try {
    const fullPath = workspacePath.replace('~/.openclaw', '/Users/openclaw/.openclaw');
    
    // 檢查主要文件
    const filesToCheck = [
      path.join(fullPath, 'SOUL.md'),
      path.join(fullPath, 'MEMORY.md'),
      path.join(fullPath, 'memory')
    ];
    
    let latestModification = 0;
    
    for (const filePath of filesToCheck) {
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        latestModification = Math.max(latestModification, stats.mtimeMs);
        
        // 如果是目錄，檢查裡面的文件
        if (stats.isDirectory()) {
          try {
            const files = fs.readdirSync(filePath);
            for (const file of files) {
              if (file.endsWith('.md')) {
                const subFilePath = path.join(filePath, file);
                const subStats = fs.statSync(subFilePath);
                latestModification = Math.max(latestModification, subStats.mtimeMs);
              }
            }
          } catch (e) {
            // 忽略目錄讀取錯誤
          }
        }
      }
    }
    
    const now = Date.now();
    const minutesAgo = latestModification > 0 ? Math.floor((now - latestModification) / (60 * 1000)) : 9999;
    
    // 智能狀態分類
    let status, emoji, label, description;
    
    if (minutesAgo < 5) { // 5分鐘內
      status = 'active_executing';
      emoji = '🔥';
      label = '執行中';
      description = '近期有文件修改，可能正在執行任務';
    } else if (minutesAgo < 30) { // 30分鐘內
      status = 'active_recent';
      emoji = '✅';
      label = '近期活動';
      description = '近期有活動跡象';
    } else if (minutesAgo < 120) { // 2小時內
      status = 'active_historical';
      emoji = '⚠️';
      label = '歷史活動';
      description = '有歷史活動記錄';
    } else if (latestModification > 0) { // 有活動記錄但很久以前
      status = 'dormant';
      emoji = '💤';
      label = '休眠中';
      description = '有配置但近期無活動';
    } else { // 完全無活動
      status = 'inactive';
      emoji = '❌';
      label = '離線';
      description = '無活動跡象';
    }
    
    return {
      hasActivity: latestModification > 0,
      lastModified: latestModification > 0 ? new Date(latestModification).toISOString() : null,
      minutesAgo: minutesAgo,
      status: status,
      emoji: emoji,
      label: label,
      description: description,
      confidence: 'high'
    };
    
  } catch (error) {
    return {
      hasActivity: false,
      lastModified: null,
      minutesAgo: 9999,
      status: 'error',
      emoji: '❓',
      label: '檢測錯誤',
      description: `活動檢測失敗: ${error.message}`,
      confidence: 'low'
    };
  }
}

// API 端點：獲取所有 agent 狀態
app.get('/api/agents', async (req, res) => {
  try {
    // 1. 獲取所有 agent 列表
    const agentsText = await getOpenClawData('openclaw agents list', false);
    const agentsList = parseAgentsList(agentsText || '');
    
    // 2. 獲取當前活躍 sessions
    const sessionsList = await getOpenClawData('openclaw sessions list --json');
    
    // 3. 組合數據
    const agents = [];
    
    if (agentsList && agentsList.length > 0) {
      for (const agent of agentsList) {
        const agentId = agent.id;
        const agentName = agent.name || agentId;
        
        // 查找對應的 session
        let session = null;
        if (sessionsList && sessionsList.sessions) {
          session = sessionsList.sessions.find(s => {
            if (s.agentId === agentId) return true;
            if (s.key && s.key.startsWith('agent:')) {
              const parts = s.key.split(':');
              if (parts.length >= 2 && parts[1] === agentId) return true;
            }
            if (s.label && s.label.includes(agentId)) return true;
            if (s.key && s.key.includes(agentId)) return true;
            return false;
          });
        }
        
        // 真實活動檢測
        const realActivity = detectRealActivity(agentId, agent.workspace);
        
        // 初始化狀態
        let status = realActivity.status;
        let lastActivity = realActivity.lastModified ? 
          `${realActivity.minutesAgo} 分鐘前` : '從未活動';
        let currentTask = '待機中';
        let taskDetails = realActivity.description;
        let tokenUsage = {
          input: 0,
          output: 0,
          total: 0
        };
        
        // 如果有 session，補充更多信息
        if (session) {
          // 更新活動時間
          if (session.updatedAt) {
            const lastUpdate = new Date(session.updatedAt);
            const now = new Date();
            const diffMs = now - lastUpdate;
            const diffMins = Math.floor(diffMs / 60000);
            
            if (diffMins < 1) {
              lastActivity = '剛剛';
            } else if (diffMins < 60) {
              lastActivity = `${diffMins}分鐘前`;
            } else {
              const diffHours = Math.floor(diffMins / 60);
              lastActivity = `${diffHours}小時前`;
            }
          }
          
          // 提取任務信息
          if (session.lastMessage) {
            currentTask = '處理訊息';
            taskDetails = session.lastMessage.substring(0, 150);
          } else if (session.lastToolCall) {
            currentTask = '執行工具';
            taskDetails = session.lastToolCall;
          } else if (session.label) {
            currentTask = '執行任務';
            taskDetails = session.label;
          } else if (session.key) {
            const keyParts = session.key.split(':');
            if (keyParts.length >= 3) {
              currentTask = keyParts[2] || '未知任務';
              taskDetails = session.key;
            }
          }
          
          // 提取 token 使用數據
          const tokenFields = [
            'inputTokens', 'inputToken', 'input_tokens',
            'outputTokens', 'outputToken', 'output_tokens',
            'totalTokens', 'totalToken', 'total_tokens',
            'tokens', 'tokenCount'
          ];
          
          tokenFields.forEach(field => {
            if (session[field] !== undefined) {
              const value = parseInt(session[field]);
              if (!isNaN(value)) {
                if (field.includes('input')) {
                  tokenUsage.input = value;
                } else if (field.includes('output')) {
                  tokenUsage.output = value;
                } else if (field.includes('total')) {
                  tokenUsage.total = value;
                }
              }
            }
          });
          
          // 如果只有 total 有值，嘗試估算 input/output
          if (tokenUsage.total > 0 && tokenUsage.input === 0 && tokenUsage.output === 0) {
            tokenUsage.input = Math.round(tokenUsage.total * 0.8);
            tokenUsage.output = Math.round(tokenUsage.total * 0.2);
          }
        }
        
        agents.push({
          id: agentId,
          name: agentName,
          status: status,
          lastActivity: lastActivity,
          currentTask: currentTask,
          taskDetails: taskDetails,
          tokenUsage: tokenUsage,
          cronTasks: [],
          configured: true,
          model: agent.model || '未知',
          modelFull: agent.model || '未知',
          workspace: agent.workspace || '未知',
          description: realActivity.description,
          emoji: realActivity.emoji
        });
      }
    }
    
    // 計算統計數據
    const executingAgents = agents.filter(a => a.status === 'active_executing');
    const recentAgents = agents.filter(a => a.status === 'active_recent');
    const historicalAgents = agents.filter(a => a.status === 'active_historical');
    const dormantAgents = agents.filter(a => a.status === 'dormant');
    const inactiveAgents = agents.filter(a => a.status === 'inactive' || a.status === 'offline');
    const errorAgents = agents.filter(a => a.status === 'error');
    
    // 有效活動 agents（執行中 + 近期活動）
    const effectiveActiveAgents = [...executingAgents, ...recentAgents];
    
    // 計算總 token 使用
    const totalTokens = agents.reduce((sum, agent) => sum + (agent.tokenUsage.total || 0), 0);
    
    const stats = {
      total: agents.length,
      executing: executingAgents.length,
      recent: recentAgents.length,
      historical: historicalAgents.length,
      dormant: dormantAgents.length,
      inactive: inactiveAgents.length,
      error: errorAgents.length,
      effectiveActive: effectiveActiveAgents.length,
      configured: agents.filter(a => a.configured).length,
      totalTokens: totalTokens,
      systemStatus: 'normal'
    };
    
    // 計算系統狀態
    const effectiveActiveRatio = stats.effectiveActive / stats.total;
    if (effectiveActiveRatio >= 0.3) {
      stats.systemStatus = 'normal';
    } else if (effectiveActiveRatio >= 0.1) {
      stats.systemStatus = 'warning';
    } else {
      stats.systemStatus = 'error';
    }
    
    const responseData = {
      success: true,
      timestamp: new Date().toISOString(),
      stats: stats,
      agents: agents
    };
    
    // 非同步記錄歷史數據
    setTimeout(() => {
      try {
        // 簡單的歷史記錄（避免複雜依賴）
        const fs = require('fs');
        const path = require('path');
        
        const HISTORY_DIR = path.join(__dirname, 'history');
        const DAILY_FILE = path.join(HISTORY_DIR, 'simple_daily.json');
        
        if (!fs.existsSync(HISTORY_DIR)) {
          fs.mkdirSync(HISTORY_DIR, { recursive: true });
        }
        
        let historyData = [];
        if (fs.existsSync(DAILY_FILE)) {
          const content = fs.readFileSync(DAILY_FILE, 'utf8');
          historyData = JSON.parse(content);
        }
        
        const record = {
          timestamp: new Date().toISOString(),
          stats: stats
        };
        
        historyData.push(record);
        
        // 只保留最近100條記錄
        if (historyData.length > 100) {
          historyData = historyData.slice(-100);
        }
        
        fs.writeFileSync(DAILY_FILE, JSON.stringify(historyData, null, 2));
        console.log('📊 歷史數據記錄完成');
        
      } catch (historyError) {
        console.error('歷史記錄失敗:', historyError.message);
      }
    }, 0);
    
    res.json(responseData);
    
  } catch (error) {
    console.error('API 錯誤:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// 簡單歷史數據 API
app.get('/api/history/simple', (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    
    const HISTORY_DIR = path.join(__dirname, 'history');
    const DAILY_FILE = path.join(HISTORY_DIR, 'simple_daily.json');
    
    if (!fs.existsSync(DAILY_FILE)) {
      return res.json({
        success: true,
        data: [],
        message: '無歷史數據',
        count: 0
      });
    }
    
    const content = fs.readFileSync(DAILY_FILE, 'utf8');
    const data = JSON.parse(content);
    
    // 計算簡單趨勢
    let trend = 'stable';
    if (data.length >= 2) {
      const recent = data.slice(-2);
      const oldEffective = recent[0].stats.effectiveActive;
      const newEffective = recent[1].stats.effectiveActive;
      
      if (newEffective > oldEffective * 1.1) {
        trend = 'improving';
      } else if (newEffective < oldEffective * 0.9) {
        trend = 'declining';
      }
    }
    
    res.json({
      success: true,
      data: data,
      count: data.length,
      trend: trend,
      latest: data.length > 0 ? data[data.length - 1] : null
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 健康檢查端點
app.get('/api/health', async (req, res) => {
  try {
    res.json({
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'Agent Monitor System',
      version: '2.1.0',
      features: ['真實活動檢測', '智能狀態分類', '簡單歷史趨勢']
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
  console.log('🔍 Agent 監控系統運行中...');
  console.log(`🌐 請在瀏覽器打開: http://localhost:${PORT}`);
  console.log(`🔄 自動刷新: 每30秒`);
  console.log(`📊 監控對象: 所有 OpenClaw Agent`);
  console.log(`⏰ 啟動時間: ${new Date().toLocaleString('zh-TW')}`);
  console.log(`🚀 版本: 2.1.0 (真實活動檢測 + 歷史趨勢)`);
  console.log(`✨ 新功能:`);
  console.log(`   • ✅ 真實活動檢測（基於文件修改時間）`);
  console.log(`   • ✅ 智能狀態分類（5層級）`);
  console.log(`   • ✅ 簡單歷史趨勢記錄`);
});