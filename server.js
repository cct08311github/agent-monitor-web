// v2.0.3 - Gateway Watchdog auto-healing

const https = require('https');
const fs = require('fs');
const app = require('./src/backend/app');
const { threatIntel, adaptiveSecurity, complianceSystem } = require('./src/backend/security');
const gatewayWatchdog = require('./src/backend/services/gatewayWatchdog');
const dashboardPayloadService = require('./src/backend/services/dashboardPayloadService');
const { getServerConfig } = require('./src/backend/config');
const { validateStartup } = require('./src/backend/config/startup');

const serverConfig = getServerConfig();
const PORT = serverConfig.port;
const startup = validateStartup();

if (!startup.ok) {
  console.error('Startup validation failed:');
  startup.errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

// 讀取本地生成的 mkcert 憑證
const sslOptions = {
  key: fs.readFileSync(serverConfig.certKeyPath),
  cert: fs.readFileSync(serverConfig.certCertPath)
};

// 改用 https.createServer
https.createServer(sslOptions, app).listen(PORT, '127.0.0.1', () => {
  const securityStatus = adaptiveSecurity.getStatus();
  const complianceStatus = complianceSystem.getStatus();

  console.log('🔍 Agent 監控系統運行中... (已啟用加密連線)');
  console.log(`🌐 本地訪問: https://localhost:${PORT}`);
  console.log(`📡 遠端安全訪問: https://mac-mini.tailde842d.ts.net:${PORT} 或 https://100.109.189.69:${PORT}`);

  // -- 下方維持您原本的 log 輸出不變 --
  console.log(`🚀 版本: 3.0.0 (Clean Architecture 修復版)`);
  console.log(`✨ 功能:`);
  console.log(`   • ✅ 真實活動檢測 (含輕量化 Cache)`);
  console.log(`   • ✅ 智能狀態分類`);
  console.log(`   • 🔒 威脅情報集成 (${threatIntel.getStatus().rules} 條規則)`);
  console.log(`   • 🛡️ 自適應安全系統 (${securityStatus.levelInfo.emoji} ${securityStatus.levelInfo.label})`);
  console.log(`   • 📋 合規報告系統 (${complianceStatus.standards.length} 個標準)`);
  console.log(`   • 📚 安全學習管道`);
  console.log(`🛡️ 當前安全級別: ${securityStatus.levelInfo.emoji} ${securityStatus.levelInfo.label}`);
  console.log(`📋 合規標準: ${complianceStatus.standards.join(', ')}`);

  // Start Gateway Watchdog (auto-healing)
  gatewayWatchdog.start();
  dashboardPayloadService.startGlobalPolling();
  console.log(`🐕 Gateway Watchdog 已啟動 (每 ${gatewayWatchdog.CONFIG.checkIntervalMs / 1000}s 檢查 | 最多修復 ${gatewayWatchdog.CONFIG.maxRepairAttempts} 次)`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  gatewayWatchdog.stop();
  console.log('\n🛑 伺服器關閉中...');
  process.exit(0);
});
process.on('SIGTERM', () => {
  gatewayWatchdog.stop();
  process.exit(0);
});
