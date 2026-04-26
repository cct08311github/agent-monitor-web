/**
 * logsInsights.ts — analytical insights computed from a filtered log entries array.
 *
 * Provides:
 *  - levels: all log levels ranked by count
 *  - topAgents: top-3 agents by log volume
 *  - hourHistogram: 24-bucket log frequency by hour-of-day
 */

import type { LogEntry } from './logsJsonExport'

export interface RankedItem {
  label: string
  count: number
  pct: number // 0..100, rounded to int
}

export interface LogsInsights {
  levels: RankedItem[]
  topAgents: RankedItem[]
  hourHistogram: number[]
}

function topN(counts: Map<string, number>, n: number, total: number): RankedItem[] {
  const items = Array.from(counts, ([label, count]) => ({
    label,
    count,
    pct: total > 0 ? Math.round((count / total) * 100) : 0,
  }))
  items.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
  return items.slice(0, n)
}

export function computeLogsInsights(entries: ReadonlyArray<LogEntry>): LogsInsights {
  const total = entries.length
  const levelCounts = new Map<string, number>()
  const agentCounts = new Map<string, number>()
  const hour = new Array<number>(24).fill(0)

  for (const e of entries) {
    const lvl = (e.level ?? 'info').toLowerCase()
    levelCounts.set(lvl, (levelCounts.get(lvl) ?? 0) + 1)

    if (e.agent) {
      agentCounts.set(e.agent, (agentCounts.get(e.agent) ?? 0) + 1)
    }

    const d = new Date(e.ts)
    const h = d.getHours()
    if (h >= 0 && h <= 23) hour[h] += 1
  }

  return {
    levels: topN(levelCounts, 10, total), // all levels (usually 3-5, cap at 10)
    topAgents: topN(agentCounts, 3, total),
    hourHistogram: hour,
  }
}
