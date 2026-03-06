const chokidar = require('chokidar');
const path = require('path');
const { EventEmitter } = require('events');
const { getOpenClawConfig } = require('../config');

class AgentWatcherService extends EventEmitter {
    constructor() {
        super();
        this.agentsDir = getOpenClawConfig().agentsRoot;
        this.watcher = null;
    }

    start() {
        if (this.watcher) return;

        // Watch for changes in any session files (JSON/JSONL)
        this.watcher = chokidar.watch(path.join(this.agentsDir, '**', 'sessions', '*'), {
            ignored: /(^|[\/\\])\../, // ignore dotfiles
            persistent: true,
            ignoreInitial: true,
            awaitWriteFinish: {
                stabilityThreshold: 500,
                pollInterval: 100
            }
        });

        // Event-driven publish (Pub/Sub pattern internally)
        this.watcher
            .on('add', (filePath) => this.emitChange('state_update', filePath))
            .on('change', (filePath) => this.emitChange('state_update', filePath));

        console.log('[EventBus] Subscribed to Agent Filesystem state updates.');
    }

    emitChange(eventType, filePath) {
        // Debounce or filter rapidly if necessary, but SSE can handle pushes quickly
        this.emit(eventType, { timestamp: Date.now(), source: filePath });
    }

    stop() {
        if (this.watcher) {
            this.watcher.close();
            this.watcher = null;
        }
    }
}

module.exports = new AgentWatcherService();
