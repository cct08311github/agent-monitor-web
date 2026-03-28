'use strict';

/**
 * TTL-based cache manager for dashboard data.
 * Each cache slot has { data, ts, ttl } and is considered fresh
 * when (Date.now() - ts) < ttl.
 */

function createCacheManager() {
    const cache = {
        sys:       { data: null, ts: 0, ttl: 5000 },
        agents:    { data: null, ts: 0, ttl: 10000 },
        subagents: { data: null, ts: 0, ttl: 10000 },
        cron:      { data: null, ts: 0, ttl: 30000 },
        cooldowns: { data: null, ts: 0, ttl: 15000 },
    };

    function isFresh(entry) {
        return entry.data !== null && Date.now() - entry.ts < entry.ttl;
    }

    function update(entry, data) {
        entry.data = data;
        entry.ts = Date.now();
    }

    function invalidate(entry) {
        entry.data = null;
        entry.ts = 0;
    }

    function invalidateAll() {
        Object.values(cache).forEach(entry => invalidate(entry));
    }

    return { cache, isFresh, update, invalidate, invalidateAll };
}

module.exports = { createCacheManager };
