'use strict';

const alertEngine = require('./alertEngine');
const errorBuffer = require('./errorBuffer');
const apiMetrics = require('./apiMetrics');
const tsdbService = require('./tsdbService');

/**
 * Build a composite health summary from in-memory observability data.
 *
 * Status thresholds:
 *   - 'critical'  : one or more alerts with severity === 'critical' in the last 5 min
 *   - 'degraded'  : one or more warnings in the last 5 min, OR p99_max_ms > 5000
 *   - 'ok'        : none of the above
 *
 * 'critical' always takes precedence over 'degraded'.
 *
 * @param {{ now?: number }} [opts]
 * @returns {{
 *   status: 'ok'|'degraded'|'critical',
 *   uptime_ms: number,
 *   agents_total_count: number,
 *   agents_active_count: number,
 *   alerts_recent_count: number,
 *   alerts_critical_count: number,
 *   alerts_warning_count: number,
 *   errors_recent_count: number,
 *   p99_max_ms: number,
 *   ts: number,
 * }}
 */
function buildHealthSummary({ now = Date.now() } = {}) {
    // ── Agent counts (from latest TSDB snapshot) ──────────────────────────────
    const counts = typeof tsdbService.getLatestAgentCounts === 'function'
        ? tsdbService.getLatestAgentCounts()
        : null;

    // ── Alerts (5-minute window) ──────────────────────────────────────────────
    const FIVE_MIN = 5 * 60 * 1000;
    const allRecent = typeof alertEngine.getRecent === 'function'
        ? alertEngine.getRecent(50)
        : [];
    const recentAlerts = allRecent.filter(a => typeof a.ts === 'number' && a.ts >= now - FIVE_MIN);
    const criticalCount = recentAlerts.filter(a => a.severity === 'critical').length;
    const warningCount  = recentAlerts.filter(a => a.severity === 'warning').length;

    // ── 5xx errors (recent buffer) ────────────────────────────────────────────
    const errors = typeof errorBuffer.getRecent === 'function'
        ? errorBuffer.getRecent(50)
        : [];
    const errorsRecentCount = errors.length;

    // ── p99 latency — max across all endpoints ────────────────────────────────
    const stats = typeof apiMetrics.getStats === 'function'
        ? apiMetrics.getStats()
        : {};
    let p99Max = 0;
    for (const key of Object.keys(stats)) {
        const v = stats[key];
        if (v && typeof v.p99 === 'number' && v.p99 > p99Max) {
            p99Max = v.p99;
        }
    }

    // ── Composite status ──────────────────────────────────────────────────────
    let status = 'ok';
    if (criticalCount > 0) {
        status = 'critical';
    } else if (warningCount > 0 || p99Max > 5000) {
        status = 'degraded';
    }

    return {
        status,
        uptime_ms: Math.round(process.uptime() * 1000),
        agents_total_count: counts?.total ?? 0,
        agents_active_count: counts?.active ?? 0,
        alerts_recent_count: recentAlerts.length,
        alerts_critical_count: criticalCount,
        alerts_warning_count: warningCount,
        errors_recent_count: errorsRecentCount,
        p99_max_ms: Math.round(p99Max),
        ts: now,
    };
}

module.exports = { buildHealthSummary };
