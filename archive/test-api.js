// 測試 OpenClaw API 數據獲取
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

async function testOpenClawCommands() {
  console.log('🧪 測試 OpenClaw 命令...');
  console.log('========================================');
  
  try {
    // 測試 agents list
    console.log('1. 測試 agents list...');
    const agentsResult = await execPromise('openclaw agents list --json');
    console.log('✅ agents list 成功');
    const agentsData = JSON.parse(agentsResult.stdout);
    console.log(`   找到 ${agentsData.agents?.length || 0} 個 agent`);
    
    // 測試 sessions list
    console.log('2. 測試 sessions list...');
    const sessionsResult = await execPromise('openclaw sessions list --json');
    console.log('✅ sessions list 成功');
    const sessionsData = JSON.parse(sessionsResult.stdout);
    console.log(`   找到 ${sessionsData.sessions?.length || 0} 個 session`);
    
    // 測試 cron status
    console.log('3. 測試 cron status...');
    const cronResult = await execPromise('openclaw cron status --json');
    console.log('✅ cron status 成功');
    const cronData = JSON.parse(cronResult.stdout);
    console.log(`   找到 ${cronData.jobs?.length || 0} 個 cron 任務`);
    
    console.log('========================================');
    console.log('🎉 所有測試通過！系統準備就緒。');
    
    // 顯示示例數據
    console.log('\n📊 示例數據結構:');
    console.log('Agents:', agentsData.agents?.slice(0, 3).map(a => ({ id: a.id, name: a.name })));
    console.log('Sessions:', sessionsData.sessions?.slice(0, 2).map(s => ({ 
      agentId: s.agentId, 
      lastActivity: s.lastActivity 
    })));
    
  } catch (error) {
    console.error('❌ 測試失敗:', error.message);
    console.error('錯誤詳情:', error.stderr || error.stdout);
    process.exit(1);
  }
}

// 運行測試
testOpenClawCommands();