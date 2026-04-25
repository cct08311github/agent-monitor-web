'use strict';

const tsdbService = require('./tsdbService');
const errorBuffer = require('./errorBuffer');
const apiMetrics = require('./apiMetrics');
const alertEngine = require('./alertEngine');

/**
 * Insight shape: { type, severity, message, ts, meta }
 * severity: 'critical' | 'warning' | 'info'
 */

/** Heuristic 1 — cost_24h_change
 * Compare sum of cost in last 24h vs prior 24h.
 * Fire 'warning' if change > 20%; fire 'info' if change > 10%.
 */
function checkCost24hChange(now) {
    const history = tsdbService.getCostHistory(60);
    if (!history || history.length < 2) return null;

    const cutoff24h = now - 24 * 60 * 60 * 1000;
    const cutoff48h = now - 48 * 60 * 60 * 1000;

    let sumRecent = 0;
    let sumPrior = 0;

    for (const row of history) {
        const t = Date.parse(row.ts);
        if (isNaN(t)) continue;
        const cost = typeof row.total_cost === 'number' ? row.total_cost : 0;
        if (t >= cutoff24h) {
            sumRecent += cost;
        } else if (t >= cutoff48h) {
            sumPrior += cost;
        }
    }

    if (sumPrior === 0) return null;

    const changePct = (sumRecent - sumPrior) / sumPrior;
    if (Math.abs(changePct) < 0.10) return null;

    const direction = changePct > 0 ? '↑' : '↓';
    const pct = Math.round(Math.abs(changePct) * 100);
    const severity = Math.abs(changePct) >= 0.20 ? 'warning' : 'info';

    return {
        type: 'cost_24h_change',
        severity,
        message: `今日成本 ${direction}${pct}%（過去 24h $${sumRecent.toFixed(4)} vs 前 24h $${sumPrior.toFixed(4)}）`,
        ts: now,
        meta: { sumRecent, sumPrior, changePct },
    };
}

/** Heuristic 2 — errors_recent_spike
 * Last 1h 5xx count > 6h average * 3, with a minimum of 3 errors.
 */
function checkErrorsRecentSpike(now) {
    const errs = errorBuffer.getRecent(50);
    if (!errs || errs.length === 0) return null;

    const h1ago = now - 3600000;
    const h7ago = now - 7 * 3600000;

    const lastHour = errs.filter(e => {
        const t = typeof e.timestamp === 'string' ? Date.parse(e.timestamp) : e.timestamp;
        return t >= h1ago;
    }).length;

    const prior6hCount = errs.filter(e => {
        const t = typeof e.timestamp === 'string' ? Date.parse(e.timestamp) : e.timestamp;
        return t >= h7ago && t < h1ago;
    }).length;

    const prior6hAvg = prior6hCount / 6;

    if (lastHour >= 3 && lastHour > prior6hAvg * 3) {
        return {
            type: 'errors_recent_spike',
            severity: 'warning',
            message: `最近 1 小時 5xx errors 激增（${lastHour} vs 6 小時平均 ${prior6hAvg.toFixed(1)}）`,
            ts: now,
            meta: { lastHour, prior6hAvg },
        };
    }
    return null;
}

/** Heuristic 3 — agent_idle
 * Find agents whose last_seen is > 24h ago based on agentActivitySummary.
 * Report the most stale one.
 */
function checkAgentIdle(now) {
    const agents = tsdbService.getAgentActivitySummary();
    if (!agents || agents.length === 0) return null;

    const threshold = 24 * 60 * 60 * 1000;
    let stalest = null;
    let stalestAge = 0;

    for (const a of agents) {
        const lastSeen = Date.parse(a.last_seen);
        if (isNaN(lastSeen)) continue;
        const age = now - lastSeen;
        if (age > threshold && age > stalestAge) {
            stalest = a;
            stalestAge = age;
        }
    }

    if (!stalest) return null;

    const hours = Math.round(stalestAge / 3600000);
    return {
        type: 'agent_idle',
        severity: 'warning',
        message: `Agent ${stalest.agent_id} 已 ${hours} 小時未活動`,
        ts: now,
        meta: { agent_id: stalest.agent_id, idleHours: hours },
    };
}

/** Heuristic 4 — p99_spike
 * Find endpoint with p99 > 3000ms; emit 'warning'.
 * If p99 > 1000ms but <= 3000ms, emit 'info'.
 */
function checkP99Spike(now) {
    const stats = apiMetrics.getStats();
    if (!stats) return null;

    let worstKey = null;
    let worstP99 = 0;

    for (const [key, s] of Object.entries(stats)) {
        if (typeof s.p99 === 'number' && s.p99 > worstP99) {
            worstP99 = s.p99;
            worstKey = key;
        }
    }

    if (!worstKey || worstP99 < 1000) return null;

    const severity = worstP99 >= 3000 ? 'warning' : 'info';
    return {
        type: 'p99_spike',
        severity,
        message: `${worstKey} p99 延遲 ${worstP99}ms${worstP99 >= 3000 ? '（高延遲警告）' : ''}`,
        ts: now,
        meta: { endpoint: worstKey, p99: worstP99 },
    };
}

/** Heuristic 5 — alert_storm
 * > 10 alerts in the last 1 hour → 'critical'.
 */
function checkAlertStorm(now) {
    const recent = alertEngine.getRecent(50);
    if (!recent || recent.length === 0) return null;

    const h1ago = now - 3600000;
    const count = recent.filter(a => (a.ts ?? 0) >= h1ago).length;

    if (count > 10) {
        return {
            type: 'alert_storm',
            severity: 'critical',
            message: `告警風暴：1 小時內 ${count} 條 alert`,
            ts: now,
            meta: { count },
        };
    }
    return null;
}

/** Heuristic 6 — rate_limit_pattern
 * Endpoint with >= 5 cumulative 429s → 'warning'.
 */
function checkRateLimitPattern(now) {
    const stats = apiMetrics.getStats();
    if (!stats) return null;

    let maxKey = null;
    let max = 0;

    for (const [k, s] of Object.entries(stats)) {
        const v = s?.errorCount?.['429'] ?? 0;
        if (v > max) { max = v; maxKey = k; }
    }

    if (max >= 5) {
        return {
            type: 'rate_limit_pattern',
            severity: 'warning',
            message: `${maxKey} 觸發 ${max} 次 rate-limit`,
            ts: now,
            meta: { endpoint: maxKey, count: max },
        };
    }
    return null;
}

const SEV_RANK = { critical: 3, warning: 2, info: 1 };

/**
 * Run all heuristics, collect non-null results,
 * sort by severity desc then ts desc, return top 5.
 * @param {number} [nowOverride] - override for unit testing
 * @returns {Array<{type, severity, message, ts, meta}>}
 */
function buildInsights(nowOverride) {
    const now = typeof nowOverride === 'number' ? nowOverride : Date.now();

    const heuristics = [
        checkCost24hChange,
        checkErrorsRecentSpike,
        checkAgentIdle,
        checkP99Spike,
        checkAlertStorm,
        checkRateLimitPattern,
    ];

    const insights = [];
    for (const h of heuristics) {
        try {
            const r = h(now);
            if (r) insights.push(r);
        } catch (_) {
            // silent — a failing heuristic must not break the others
        }
    }

    insights.sort((a, b) => {
        const sd = (SEV_RANK[b.severity] ?? 0) - (SEV_RANK[a.severity] ?? 0);
        if (sd !== 0) return sd;
        return (b.ts ?? 0) - (a.ts ?? 0);
    });

    return insights.slice(0, 5);
}

module.exports = {
    buildInsights,
    // Exported for unit testing
    _checkCost24hChange: checkCost24hChange,
    _checkErrorsRecentSpike: checkErrorsRecentSpike,
    _checkAgentIdle: checkAgentIdle,
    _checkP99Spike: checkP99Spike,
    _checkAlertStorm: checkAlertStorm,
    _checkRateLimitPattern: checkRateLimitPattern,
};
