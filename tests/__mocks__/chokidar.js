// Mock chokidar for test environment (chokidar v5 is ESM-only and breaks Jest)
const EventEmitter = require('events');

class FSWatcher extends EventEmitter {
    constructor() {
        super();
        this.closed = false;
    }
    add() { return this; }
    unwatch() { return this; }
    close() { this.closed = true; return Promise.resolve(); }
    getWatched() { return {}; }
}

module.exports = {
    watch: () => new FSWatcher(),
    FSWatcher,
};
