#!/usr/bin/env node

/**
 * 真實活動檢測系統
 * 多維度檢測 Agent 的真實活動狀態
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Agent 工作空間基礎路徑
const WORKSPACE_BASE = '/Users/openclaw/.openclaw';

// 獲取所有 Agent 列表
function getAgentsList() {
  try {
    const output = execSync('openclaw agents list', { encoding: 'utf8' });
    return parseAgentsList(output);
  } catch (error) {
    console.error('獲取 Agent 列表失敗:', error.message);
    return [];
  }
}

// 解析 Agent 列表文本
function parseAgentsList(text) {
  const agents = [];
  const lines = text.split('\n');
  let currentAgent = null;
  
  for (const line of lines) {
    // 匹配 agent 行: "- agentId (name)" 或 "- agentId"
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
    
    // 匹配 workspace 行
    if (currentAgent && line.includes('Workspace:')) {
      const workspaceMatch = line.match(/Workspace:\s+(.+)/);
      if (workspaceMatch) {
        currentAgent.workspace = workspaceMatch[1].trim();
      }
    }
  }
  
  // 添加最後一個 agent
  if (currentAgent) {
    agents.push(currentAgent);
  }
  
  return agents;
}

// 檢查 Agent 是否有活躍 session
function checkSessionExists(agentId) {
  try {
    const sessionsOutput = execSync('openclaw sessions list --json', { encoding: 'utf8' });
    const sessionsData = JSON.parse(sessionsOutput);
    
    // sessions 數據在 sessionsData.sessions 中
    const sessions = sessionsData.sessions || [];
    
    // 查找包含 agentId 的 session
    return sessions.some(session => {
      return session.key && session.key.includes(agentId);
    });
  } catch (error) {
    console.error(`檢查 ${agentId} session 失敗:`, error.message);
    return false;
  }
}

// 檢查工作空間文件修改時間
function checkWorkspaceModification(agentId, workspacePath) {
  try {
    const fullPath = workspacePath.replace('~/.openclaw', WORKSPACE_BASE);
    
    // 檢查主要配置文件
    const soulPath = path.join(fullPath, 'SOUL.md');
    const memoryPath = path.join(fullPath, 'MEMORY.md');
    const memoryDir = path.join(fullPath, 'memory');
    
    let latestModification = 0;
    
    // 檢查 SOUL.md
    if (fs.existsSync(soulPath)) {
      const stats = fs.statSync(soulPath);
      latestModification = Math.max(latestModification, stats.mtimeMs);
    }
    
    // 檢查 MEMORY.md
    if (fs.existsSync(memoryPath)) {
      const stats = fs.statSync(memoryPath);
      latestModification = Math.max(latestModification, stats.mtimeMs);
    }
    
    // 檢查 memory/ 目錄中的最新文件
    if (fs.existsSync(memoryDir)) {
      const files = fs.readdirSync(memoryDir);
      for (const file of files) {
        if (file.endsWith('.md')) {
          const filePath = path.join(memoryDir, file);
          const stats = fs.statSync(filePath);
          latestModification = Math.max(latestModification, stats.mtimeMs);
        }
      }
    }
    
    // 計算距離現在的時間（毫秒）
    const now = Date.now();
    const timeDiff = now - latestModification;
    
    // 返回活動等級
    if (timeDiff < 5 * 60 * 1000) { // 5分鐘內
      return { active: true, level: 'high', lastModified: new Date(latestModification) };
    } else if (timeDiff < 30 * 60 * 1000) { // 30分鐘內
      return { active: true, level: 'medium', lastModified: new Date(latestModification) };
    } else if (timeDiff < 2 * 60 * 60 * 1000) { // 2小時內
      return { active: true, level: 'low', lastModified: new Date(latestModification) };
    } else {
      return { active: false, level: 'inactive', lastModified: new Date(latestModification) };
    }
    
  } catch (error) {
    console.error(`檢查 ${agentId} 工作空間失敗:`, error.message);
    return { active: false, level: 'error', lastModified: null };
  }
}

// 檢查進程活動
function checkProcessActivity(agentId) {
  try {
    // 查找與 agent 相關的進程
    const psOutput = execSync('ps aux | grep openclaw', { encoding: 'utf8' });
    const lines = psOutput.split('\n');
    
    let agentProcessCount = 0;
    let totalOpenClawProcesses = 0;
    
    for (const line of lines) {
      if (line.includes('openclaw') && !line.includes('grep')) {
        totalOpenClawProcesses++;
        
        // 檢查是否與當前 agent 相關
        if (line.toLowerCase().includes(agentId.toLowerCase())) {
          agentProcessCount++;
        }
      }
    }
    
    return {
      hasProcess: agentProcessCount > 0,
      processCount: agentProcessCount,
      totalProcesses: totalOpenClawProcesses,
      ratio: totalOpenClawProcesses > 0 ? agentProcessCount / totalOpenClawProcesses : 0
    };
  } catch (error) {
    console.error(`檢查 ${agentId} 進程失敗:`, error.message);
    return { hasProcess: false, processCount: 0, totalProcesses: 0, ratio: 0 };
  }
}

// 檢查 cron 任務活動
function checkCronActivity(agentId) {
  try {
    const cronOutput = execSync('openclaw cron list --json', { encoding: 'utf8' });
    const cronData = JSON.parse(cronOutput);
    
    // cron 任務在 cronData.jobs 中
    const cronJobs = cronData.jobs || [];
    
    const agentCronJobs = cronJobs.filter(job => {
      return job.name && job.name.toLowerCase().includes(agentId.toLowerCase());
    });
    
    return {
      hasCronJobs: agentCronJobs.length > 0,
      cronCount: agentCronJobs.length,
      cronJobs: agentCronJobs.map(job => job.name)
    };
  } catch (error) {
    console.error(`檢查 ${agentId} cron 任務失敗:`, error.message);
    return { hasCronJobs: false, cronCount: 0, cronJobs: [] };
  }
}

// 綜合活動檢測
function detectAgentActivity(agent) {
  console.log(`\n🔍 檢測 Agent: ${agent.id} (${agent.name})`);
  
  // 1. 檢查 session
  const hasSession = checkSessionExists(agent.id);
  console.log(`   • Session 檢查: ${hasSession ? '✅ 有活躍 session' : '❌ 無活躍 session'}`);
  
  // 2. 檢查工作空間修改
  const workspaceActivity = checkWorkspaceModification(agent.id, agent.workspace);
  console.log(`   • 工作空間活動: ${workspaceActivity.active ? `✅ ${workspaceActivity.level} (${workspaceActivity.lastModified?.toLocaleTimeString() || '未知'})` : '❌ 無近期活動'}`);
  
  // 3. 檢查進程
  const processActivity = checkProcessActivity(agent.id);
  console.log(`   • 進程活動: ${processActivity.hasProcess ? `✅ ${processActivity.processCount} 個相關進程` : '❌ 無相關進程'}`);
  
  // 4. 檢查 cron 任務
  const cronActivity = checkCronActivity(agent.id);
  console.log(`   • Cron 任務: ${cronActivity.hasCronJobs ? `✅ ${cronActivity.cronCount} 個定時任務` : '❌ 無定時任務'}`);
  
  // 計算綜合活動分數
  let activityScore = 0;
  let maxScore = 0;
  
  // Session 權重: 30%
  if (hasSession) {
    activityScore += 30;
  }
  maxScore += 30;
  
  // 工作空間活動權重: 40%
  if (workspaceActivity.active) {
    switch (workspaceActivity.level) {
      case 'high': activityScore += 40; break;
      case 'medium': activityScore += 25; break;
      case 'low': activityScore += 10; break;
    }
  }
  maxScore += 40;
  
  // 進程活動權重: 20%
  if (processActivity.hasProcess) {
    activityScore += 20 * processActivity.ratio;
  }
  maxScore += 20;
  
  // Cron 任務權重: 10%
  if (cronActivity.hasCronJobs) {
    activityScore += 10;
  }
  maxScore += 10;
  
  const finalScore = maxScore > 0 ? (activityScore / maxScore) * 100 : 0;
  
  // 分類活動等級
  let activityLevel, emoji, description;
  if (finalScore >= 70) {
    activityLevel = 'high';
    emoji = '🔥';
    description = '高度活躍';
  } else if (finalScore >= 40) {
    activityLevel = 'medium';
    emoji = '⚠️';
    description = '中度活躍';
  } else if (finalScore >= 20) {
    activityLevel = 'low';
    emoji = '💤';
    description = '低度活躍';
  } else {
    activityLevel = 'inactive';
    emoji = '❌';
    description = '不活躍';
  }
  
  console.log(`   • 綜合活動分數: ${finalScore.toFixed(1)}% ${emoji} ${description}`);
  
  return {
    agentId: agent.id,
    agentName: agent.name,
    hasSession,
    workspaceActivity,
    processActivity,
    cronActivity,
    activityScore: finalScore,
    activityLevel,
    emoji,
    description,
    timestamp: new Date().toISOString()
  };
}

// 主函數
async function main() {
  console.log('🚀 真實活動檢測系統啟動');
  console.log('==========================\n');
  
  // 獲取所有 agents
  const agents = getAgentsList();
  console.log(`找到 ${agents.length} 個 agents`);
  
  // 檢測每個 agent 的活動
  const results = [];
  for (const agent of agents) {
    const result = detectAgentActivity(agent);
    results.push(result);
  }
  
  // 統計結果
  console.log('\n📊 檢測結果統計');
  console.log('==========================');
  
  const levelCounts = {
    high: results.filter(r => r.activityLevel === 'high').length,
    medium: results.filter(r => r.activityLevel === 'medium').length,
    low: results.filter(r => r.activityLevel === 'low').length,
    inactive: results.filter(r => r.activityLevel === 'inactive').length
  };
  
  console.log(`🔥 高度活躍: ${levelCounts.high} 個`);
  console.log(`⚠️ 中度活躍: ${levelCounts.medium} 個`);
  console.log(`💤 低度活躍: ${levelCounts.low} 個`);
  console.log(`❌ 不活躍: ${levelCounts.inactive} 個`);
  
  // 保存結果到文件
  const outputFile = path.join(__dirname, 'activity_results.json');
  fs.writeFileSync(outputFile, JSON.stringify({
    timestamp: new Date().toISOString(),
    totalAgents: agents.length,
    results: results,
    summary: levelCounts
  }, null, 2));
  
  console.log(`\n💾 結果已保存到: ${outputFile}`);
  
  // 生成建議
  console.log('\n💡 優化建議');
  console.log('==========================');
  
  const inactiveAgents = results.filter(r => r.activityLevel === 'inactive');
  if (inactiveAgents.length > 0) {
    console.log('建議檢查以下不活躍 agents:');
    inactiveAgents.forEach(agent => {
      console.log(`   • ${agent.agentId} (${agent.agentName}) - 分數: ${agent.activityScore.toFixed(1)}%`);
    });
  }
  
  const lowActivityAgents = results.filter(r => r.activityLevel === 'low');
  if (lowActivityAgents.length > 0) {
    console.log('\n建議優化以下低活躍 agents:');
    lowActivityAgents.forEach(agent => {
      console.log(`   • ${agent.agentId} (${agent.agentName}) - 分數: ${agent.activityScore.toFixed(1)}%`);
    });
  }
  
  console.log('\n✅ 檢測完成！');
}

// 執行主函數
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  getAgentsList,
  checkSessionExists,
  checkWorkspaceModification,
  checkProcessActivity,
  checkCronActivity,
  detectAgentActivity
};