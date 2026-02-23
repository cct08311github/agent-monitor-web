#!/usr/bin/env node

/**
 * 簡化版真實活動檢測
 * 專注於整合到現有監控系統
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 獲取所有 Agent 的基本信息
function getAgentsInfo() {
  try {
    const output = execSync('openclaw agents list', { encoding: 'utf8' });
    const agents = [];
    const lines = output.split('\n');
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
          workspace: null
        };
      }
      
      // 匹配 workspace
      if (currentAgent && line.includes('Workspace:')) {
        const workspaceMatch = line.match(/Workspace:\s+(.+)/);
        if (workspaceMatch) {
          currentAgent.workspace = workspaceMatch[1].trim();
        }
      }
    }
    
    if (currentAgent) {
      agents.push(currentAgent);
    }
    
    return agents;
  } catch (error) {
    console.error('獲取 Agent 信息失敗:', error.message);
    return [];
  }
}

// 檢查工作空間活動（最可靠的指標）
function checkWorkspaceActivity(agentId, workspacePath) {
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
            // 忽略目讀取錯誤
          }
        }
      }
    }
    
    const now = Date.now();
    const minutesAgo = Math.floor((now - latestModification) / (60 * 1000));
    
    return {
      lastModified: latestModification > 0 ? new Date(latestModification) : null,
      minutesAgo: minutesAgo,
      hasActivity: latestModification > 0
    };
  } catch (error) {
    return {
      lastModified: null,
      minutesAgo: 9999,
      hasActivity: false,
      error: error.message
    };
  }
}

// 智能狀態分類
function classifyAgentStatus(agentId, workspaceActivity) {
  const minutesAgo = workspaceActivity.minutesAgo;
  
  if (minutesAgo < 5) { // 5分鐘內
    return {
      status: 'active_executing',
      emoji: '🔥',
      label: '執行中',
      confidence: 'high',
      description: '近期有文件修改，可能正在執行任務'
    };
  } else if (minutesAgo < 30) { // 30分鐘內
    return {
      status: 'active_recent',
      emoji: '✅',
      label: '近期活動',
      confidence: 'medium',
      description: '近期有活動跡象'
    };
  } else if (minutesAgo < 120) { // 2小時內
    return {
      status: 'active_historical',
      emoji: '⚠️',
      label: '歷史活動',
      confidence: 'low',
      description: '有歷史活動記錄'
    };
  } else if (workspaceActivity.hasActivity) { // 有活動記錄但很久以前
    return {
      status: 'dormant',
      emoji: '💤',
      label: '休眠中',
      confidence: 'medium',
      description: '有配置但近期無活動'
    };
  } else { // 完全無活動
    return {
      status: 'inactive',
      emoji: '❌',
      label: '離線',
      confidence: 'high',
      description: '無活動跡象'
    };
  }
}

// 主函數
function main() {
  console.log('🔍 簡化版真實活動檢測');
  console.log('==========================\n');
  
  // 獲取 agents
  const agents = getAgentsInfo();
  console.log(`找到 ${agents.length} 個 agents\n`);
  
  // 檢測每個 agent
  const results = [];
  
  for (const agent of agents) {
    console.log(`檢查: ${agent.id} (${agent.name})`);
    
    if (!agent.workspace) {
      console.log(`  ❌ 無工作空間信息\n`);
      results.push({
        agentId: agent.id,
        agentName: agent.name,
        error: '無工作空間信息',
        status: 'unknown'
      });
      continue;
    }
    
    // 檢查工作空間活動
    const workspaceActivity = checkWorkspaceActivity(agent.id, agent.workspace);
    
    // 分類狀態
    const status = classifyAgentStatus(agent.id, workspaceActivity);
    
    // 顯示結果
    console.log(`  工作空間: ${agent.workspace}`);
    if (workspaceActivity.lastModified) {
      console.log(`  最後修改: ${workspaceActivity.lastModified.toLocaleTimeString()} (${workspaceActivity.minutesAgo} 分鐘前)`);
    }
    console.log(`  狀態: ${status.emoji} ${status.label}`);
    console.log(`  描述: ${status.description}\n`);
    
    results.push({
      agentId: agent.id,
      agentName: agent.name,
      workspace: agent.workspace,
      workspaceActivity: workspaceActivity,
      status: status.status,
      emoji: status.emoji,
      label: status.label,
      description: status.description,
      confidence: status.confidence,
      timestamp: new Date().toISOString()
    });
  }
  
  // 統計
  console.log('📊 活動統計');
  console.log('==========================');
  
  const statusCounts = {};
  results.forEach(result => {
    statusCounts[result.status] = (statusCounts[result.status] || 0) + 1;
  });
  
  Object.entries(statusCounts).forEach(([status, count]) => {
    const emoji = results.find(r => r.status === status)?.emoji || '';
    console.log(`${emoji} ${status}: ${count} 個`);
  });
  
  // 保存結果
  const outputFile = path.join(__dirname, 'simple_activity_results.json');
  fs.writeFileSync(outputFile, JSON.stringify({
    timestamp: new Date().toISOString(),
    totalAgents: agents.length,
    results: results,
    summary: statusCounts
  }, null, 2));
  
  console.log(`\n💾 結果已保存到: ${outputFile}`);
  
  // 生成整合建議
  console.log('\n💡 監控系統整合建議');
  console.log('==========================');
  console.log('1. 將此檢測邏輯整合到 server.js 的 /api/agents 端點');
  console.log('2. 使用 workspace 活動時間作為主要活動指標');
  console.log('3. 實現智能狀態分類（5層級）');
  console.log('4. 添加活動時間戳顯示');
  
  return results;
}

// 執行
if (require.main === module) {
  main();
}

module.exports = {
  getAgentsInfo,
  checkWorkspaceActivity,
  classifyAgentStatus,
  main
};