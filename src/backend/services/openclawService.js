const fs = require('fs');
const path = require('path');
const { getOpenClawConfig } = require('../config');
const openclawClient = require('./openclawClient');
const logger = require('../utils/logger');

// Cache implementation to avoid running exec too often
const cache = {
  agentsText: null,
  lastFetched: 0
};
const CACHE_TTL = 10000; // 10 seconds

class OpenClawService {
  /**
   * 執行 OpenClaw 命令並返回結果
   */
  async getOpenClawData(command, parseJson = true) {
    // Basic caching for agents list
    if (command === 'openclaw agents list') {
      const now = Date.now();
      if (cache.agentsText && now - cache.lastFetched < CACHE_TTL) {
        return parseJson ? JSON.parse(cache.agentsText) : cache.agentsText;
      }
    }

    try {
      const args = command.replace(/^openclaw\s+/, '').split(/\s+/);
      const { stdout } = await openclawClient.runArgs(args);

      if (command === 'openclaw agents list') {
        cache.agentsText = stdout;
        cache.lastFetched = Date.now();
      }

      return parseJson ? JSON.parse(stdout) : stdout;
    } catch (error) {
      logger.error('openclaw_command_failed', { command, msg: error.message });
      return parseJson ? {} : '';
    }
  }

  /**
   * 解析 Agent 列表文本
   */
  parseAgentsList(text) {
    const agents = [];
    const lines = text.split('\n');
    let currentAgent = null;

    for (const line of lines) {
      const agentMatch = line.match(/^- ([\w-]+)(?:\s+\(([^)]+)\))?/);
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
        /* istanbul ignore next */
        if (match) currentAgent.workspace = match[1].trim();
      }

      if (currentAgent && line.includes('Model:')) {
        const match = line.match(/Model:\s+(.+)/);
        /* istanbul ignore next */
        if (match) currentAgent.model = match[1].trim();
      }
    }

    if (currentAgent) agents.push(currentAgent);
    return agents;
  }

  /**
   * 真實活動檢測 (Heartbeat Simulation via File Stat)
   */
  detectRealActivity(agentId, workspacePath) {
    try {
      const { root, agentsRoot } = getOpenClawConfig();
      const fullPath = workspacePath.replace('~/.openclaw', root);

      // Path traversal guard
      const resolvedPath = path.resolve(fullPath);
      const resolvedRoot = path.resolve(root);
      if (!resolvedPath.startsWith(resolvedRoot + path.sep) && resolvedPath !== resolvedRoot) {
        return { status: 'error', emoji: '❌', label: '路徑錯誤', minutesAgo: 9999 };
      }

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

      // 補查 isolated cron sessions（不寫入 workspace，只寫 sessions/*.jsonl）
      const sessionsDir = path.join(agentsRoot, agentId, 'sessions');
      if (fs.existsSync(sessionsDir)) {
        const sessionFiles = fs.readdirSync(sessionsDir)
          .filter(f => f.endsWith('.jsonl'));
        for (const f of sessionFiles) {
          const mtime = fs.statSync(path.join(sessionsDir, f)).mtimeMs;
          latestModification = Math.max(latestModification, mtime);
        }
      }

      const now = Date.now();
      const minutesAgo = latestModification > 0 ? Math.floor((now - latestModification) / (60 * 1000)) : 9999;

      let status, emoji, label;
      if (minutesAgo < 5) {
        status = 'active_executing'; emoji = '🔥'; label = '執行中';
      } else if (minutesAgo < 60) {
        status = 'active_recent'; emoji = '✅'; label = '近期活動';
      } else if (minutesAgo < 240) {
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
}

module.exports = new OpenClawService();
