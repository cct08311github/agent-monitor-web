const { exec } = require('child_process');
const util = require('util');
const fs = require('fs');
const path = require('path');

const execPromise = util.promisify(exec);

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
      const execCommand = command.startsWith('openclaw')
        ? command.replace('openclaw', '/Users/openclaw/.openclaw/bin/openclaw')
        : command;
      const { stdout } = await execPromise(execCommand);

      if (command === 'openclaw agents list') {
        cache.agentsText = stdout;
        cache.lastFetched = Date.now();
      }

      return parseJson ? JSON.parse(stdout) : stdout;
    } catch (error) {
      console.error(`執行命令失敗: ${command}`, error.message);
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

  /**
   * 真實活動檢測 (Heartbeat Simulation via File Stat)
   */
  detectRealActivity(agentId, workspacePath) {
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
