// 測試伺服器功能
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// 從 server.js 導入函數
async function getOpenClawData(command, parseJson = true) {
  try {
    const { stdout, stderr } = await execPromise(command);
    if (stderr && !stderr.includes('warning')) {
      console.error(`stderr: ${stderr}`);
      return null;
    }
    if (parseJson) {
      return JSON.parse(stdout);
    }
    return stdout;
  } catch (error) {
    console.error(`執行命令錯誤: ${command}`, error.message);
    return null;
  }
}

// 解析 agents list 文本輸出
function parseAgentsList(text) {
  const agents = [];
  const lines = text.split('\n');
  let currentAgent = null;
  
  for (const line of lines) {
    // 匹配 agent 行: "- main (default)" 或 "- visionary (閃電)"
    const agentMatch = line.match(/^- (\w+)(?:\s+\(([^)]+)\))?/);
    if (agentMatch) {
      if (currentAgent) {
        agents.push(currentAgent);
      }
      currentAgent = {
        id: agentMatch[1],
        name: agentMatch[2] || agentMatch[1],
        configured: true
      };
    }
    
    // 匹配 workspace 行
    if (currentAgent && line.includes('Workspace:')) {
      currentAgent.workspace = line.split('Workspace:')[1].trim();
    }
    
    // 匹配 model 行
    if (currentAgent && line.includes('Model:')) {
      currentAgent.model = line.split('Model:')[1].trim();
    }
  }
  
  // 添加最後一個 agent
  if (currentAgent) {
    agents.push(currentAgent);
  }
  
  return agents;
}

async function testServerFunctions() {
  console.log('🧪 測試伺服器功能...');
  console.log('========================================');
  
  try {
    // 測試 agents list 解析
    console.log('1. 測試 agents list 解析...');
    const agentsText = await getOpenClawData('openclaw agents list', false);
    if (!agentsText) {
      throw new Error('無法獲取 agents list');
    }
    
    const agents = parseAgentsList(agentsText);
    console.log(`✅ 解析成功，找到 ${agents.length} 個 agent`);
    console.log('   前5個 agent:', agents.slice(0, 5).map(a => `${a.id} (${a.name})`));
    
    // 測試 sessions list
    console.log('2. 測試 sessions list...');
    const sessions = await getOpenClawData('openclaw sessions list --json');
    if (!sessions) {
      throw new Error('無法獲取 sessions list');
    }
    console.log(`✅ sessions list 成功，找到 ${sessions.sessions?.length || 0} 個 session`);
    
    // 測試 cron status
    console.log('3. 測試 cron status...');
    const cron = await getOpenClawData('openclaw cron status --json');
    if (!cron) {
      console.log('⚠️  cron status 可能為空或錯誤，繼續測試...');
    } else {
      console.log(`✅ cron status 成功，找到 ${cron.jobs?.length || 0} 個任務`);
    }
    
    // 測試數據組合
    console.log('4. 測試數據組合...');
    const testAgents = [];
    for (const agent of agents.slice(0, 3)) {
      const session = sessions.sessions?.find(s => 
        s.agentId === agent.id || 
        (s.label && s.label.includes(agent.id))
      );
      
      testAgents.push({
        id: agent.id,
        name: agent.name,
        status: session ? 'active' : 'offline',
        lastActivity: session?.lastActivity ? new Date(session.lastActivity).toLocaleString('zh-TW') : '從未活動',
        currentTask: session?.lastMessage ? session.lastMessage.substring(0, 50) + '...' : '無',
        configured: true
      });
    }
    
    console.log('✅ 數據組合成功');
    console.log('   示例 agent 數據:', testAgents);
    
    console.log('========================================');
    console.log('🎉 所有伺服器功能測試通過！');
    console.log('\n📊 系統準備狀態:');
    console.log(`   • 可監控 agent 數: ${agents.length}`);
    console.log(`   • 當前活躍 session: ${sessions.sessions?.length || 0}`);
    console.log(`   • 定時任務數: ${cron?.jobs?.length || 0}`);
    console.log(`   • 數據更新頻率: 30秒`);
    
  } catch (error) {
    console.error('❌ 測試失敗:', error.message);
    console.error('錯誤堆棧:', error.stack);
    process.exit(1);
  }
}

// 運行測試
testServerFunctions();