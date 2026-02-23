#!/usr/bin/env node

const http = require('http');

console.log('🔍 Agent 監控系統修復測試');
console.log('==========================\n');

// 測試 API
http.get('http://localhost:3000/api/agents', (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    try {
      const result = JSON.parse(data);
      
      console.log('✅ API 連接測試: 成功');
      console.log(`   返回 ${result.agents?.length || 0} 個 agents\n`);
      
      // 測試統計數據
      const stats = result.stats || {};
      const totalActive = stats.active + (stats.likelyActive || 0);
      
      console.log('📈 統計數據測試:');
      console.log(`   • 總 Agent 數: ${stats.total}`);
      console.log(`   • 在線 (active): ${stats.active}`);
      console.log(`   • 可能活動 (likelyActive): ${stats.likelyActive || 0}`);
      console.log(`   • 總有效活動: ${totalActive}`);
      console.log(`   • 離線: ${stats.offline}`);
      console.log(`   • 總 Token: ${stats.totalTokens}`);
      console.log(`   • 系統狀態: ${stats.systemStatus}`);
      
      if (totalActive > 1) {
        console.log('   ✅ 統計正確: 多個 agents 顯示為活動狀態\n');
      } else {
        console.log('   ⚠️ 警告: 只有 1 個活動 agent\n');
      }
      
      // 測試模型名稱顯示
      console.log('🔤 模型名稱顯示測試:');
      const sampleAgent = result.agents?.find(a => a.model && a.model.includes('/'));
      if (sampleAgent) {
        console.log(`   • 樣本模型: ${sampleAgent.model}`);
        console.log(`   • 完整模型名稱: ${sampleAgent.modelFull || sampleAgent.model}`);
        
        // 檢查模型名稱長度
        const modelName = sampleAgent.modelFull || sampleAgent.model;
        if (modelName.length > 20) {
          console.log('   ✅ 模型名稱較長，應該可以折行顯示\n');
        } else {
          console.log('   ⚠️ 模型名稱較短\n');
        }
      }
      
      // 測試 Agent 狀態類型
      console.log('🤖 Agent 狀態類型測試:');
      const agents = result.agents || [];
      const statusCounts = {
        active: agents.filter(a => a.status === 'active').length,
        likely_active: agents.filter(a => a.status === 'likely_active').length,
        offline: agents.filter(a => a.status === 'offline').length
      };
      
      console.log(`   • ✅ 在線 (active): ${statusCounts.active}`);
      console.log(`   • ⚠️ 可能活動 (likely_active): ${statusCounts.likely_active}`);
      console.log(`   • ❌ 離線 (offline): ${statusCounts.offline}`);
      
      if (statusCounts.active > 0 && statusCounts.likely_active > 0) {
        console.log('   ✅ 狀態類型完整: 包含多種狀態\n');
      } else {
        console.log('   ⚠️ 狀態類型可能不完整\n');
      }
      
      // 測試摘要
      console.log('📋 測試結果摘要:');
      console.log('==========================');
      
      const tests = [
        { name: 'API 連接', passed: result.success },
        { name: '統計數據', passed: totalActive > 1 },
        { name: '模型顯示', passed: sampleAgent && (sampleAgent.modelFull || sampleAgent.model).length > 20 },
        { name: '狀態類型', passed: statusCounts.active > 0 && statusCounts.likely_active > 0 }
      ];
      
      let passedCount = 0;
      tests.forEach(test => {
        const status = test.passed ? '✅' : '❌';
        console.log(`   ${status} ${test.name}`);
        if (test.passed) passedCount++;
      });
      
      console.log(`\n   通過 ${passedCount}/${tests.length} 項測試`);
      
      if (passedCount === tests.length) {
        console.log('\n🎉 所有測試通過！監控系統修復完成。');
      } else if (passedCount >= tests.length / 2) {
        console.log('\n⚠️ 部分測試通過，可能需要進一步調整。');
      } else {
        console.log('\n❌ 多數測試失敗，需要檢查系統。');
      }
      
    } catch (error) {
      console.error('❌ 測試失敗:', error.message);
    }
  });
}).on('error', (error) => {
  console.error('❌ 無法連接 API:', error.message);
  console.log('\n請確保監控系統正在運行:');
  console.log('  cd /Users/openclaw/.openclaw/shared/projects/agent-monitor-web');
  console.log('  node server.js');
});