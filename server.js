// v2.1.0 - Graceful Shutdown

const https = require('https');
const fs = require('fs');
const app = require('./src/backend/app');
const { threatIntel, adaptiveSecurity, complianceSystem } = require('./src/backend/security');
const gatewayWatchdog = require('./src/backend/services/gatewayWatchdog');
const dashboardPayloadService = require('./src/backend/services/dashboardPayloadService');
const sseStreamManager = require('./src/backend/services/sseStreamManager');
const tsdbService = require('./src/backend/services/tsdbService');
const taskHubRepository = require('./src/backend/repositories/taskHubRepository');
const { getServerConfig } = require('./src/backend/config');
const { validateStartup } = require('./src/backend/config/startup');
const { installHandlers: installProcessHandlers } = require('./src/backend/utils/processHandlers');
const apiRouter = require('./src/backend/routes/api');

const serverConfig = getServerConfig();
const PORT = serverConfig.port;
const startup = validateStartup();

if (!startup.ok) {
  console.error('Startup validation failed:');
  startup.errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

// Defense-in-depth: catch async rejections and uncaught exceptions that would
// otherwise silently kill the process. Logs structured entry before exit(1).
installProcessHandlers();

const sslOptions = {
  key: fs.readFileSync(serverConfig.certKeyPath),
  cert: fs.readFileSync(serverConfig.certCertPath)
};

const server = https.createServer(sslOptions, app);

server.listen(PORT, '127.0.0.1', () => {
  const securityStatus = adaptiveSecurity.getStatus();
  const complianceStatus = complianceSystem.getStatus();

  console.log('🔍 Agent 監控系統運行中... (已啟用加密連線)');
  console.log(`🌐 本地訪問: https://localhost:${PORT}`);
  console.log(`📡 遠端安全訪問: 透過 Tailscale 或 VPN 連線`);
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

  gatewayWatchdog.start();
  dashboardPayloadService.startGlobalPolling();
  console.log(`🐕 Gateway Watchdog 已啟動 (每 ${gatewayWatchdog.CONFIG.checkIntervalMs / 1000}s 檢查 | 最多修復 ${gatewayWatchdog.CONFIG.maxRepairAttempts} 次)`);
});

// --- Graceful Shutdown ---
const SHUTDOWN_TIMEOUT_MS = 10_000;
let shutdownCalled = 0;

function gracefulShutdown(signal) {
  if (shutdownCalled++ > 0) return; // atomic guard against double-signal
  console.log(`\n🛑 收到 ${signal}，伺服器正在優雅關閉...`);

  // Hard deadline: force exit if server.close() hangs (e.g. keep-alive connections)
  const forceTimer = setTimeout(() => {
    console.error('⚠️ Shutdown timeout — forcing exit');
    process.exit(0);
  }, SHUTDOWN_TIMEOUT_MS);
  forceTimer.unref();

  // 1. Stop accepting new connections; callback fires after all in-flight requests finish
  server.close(() => {
    console.log('✅ HTTP server closed');

    // 2. Drain SSE connections — send shutdown event then end()
    sseStreamManager.closeAll();
    apiRouter.closeAllLogStreams();
    console.log('✅ SSE connections drained');

    // 3. Stop background services (polling, file watchers, watchdog)
    dashboardPayloadService.stopGlobalPolling();
    gatewayWatchdog.stop();
    console.log('✅ Background services stopped');

    // 4. Close databases (flush WAL)
    tsdbService.close();
    taskHubRepository.close();
    console.log('✅ Databases closed');

    console.log('🏁 Graceful shutdown complete');
    clearTimeout(forceTimer);
    process.exit(0);
  });
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
