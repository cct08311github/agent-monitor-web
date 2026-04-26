/**
 * agentsInsights.ts — analytical insights computed from agent data.
 *
 * Provides:
 *  - statusDistribution: distribution of agent statuses (active_executing/active_recent/dormant/offline/inactive)
 *  - aliasCount / totalAgents / aliasPct: how many agents have user-defined aliases
 *  - activityHourHistogram: 24-bucket histogram of last-active hours (based on lastActiveAt)
 */

export interface RankedItem {
  label: string
  count: number
  pct: number // 0..100, rounded to int
}

export interface AgentLike {
  id: string
  status?: string | null
  name?: string | null
  lastActiveAt?: number | null
}

export interface AgentsInsights {
  statusDistribution: RankedItem[]
  aliasCount: number
  totalAgents: number
  aliasPct: number
  activityHourHistogram: number[] // 24 buckets, index = hour of day (local time)
}

export function computeAgentsInsights<T extends AgentLike>(
  agents: ReadonlyArray<T>,
  aliases: ReadonlyMap<string, string>,
): AgentsInsights {
  const total = agents.length

  // Status distribution — normalize to lowercase
  const statusCounts = new Map<string, number>()
  for (const a of agents) {
    const s = (a.status ?? 'unknown').toLowerCase()
    statusCounts.set(s, (statusCounts.get(s) ?? 0) + 1)
  }
  const statusDistribution = Array.from(statusCounts, ([label, count]) => ({
    label,
    count,
    pct: total > 0 ? Math.round((count / total) * 100) : 0,
  })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))

  // Alias usage
  const aliasCount = agents.filter((a) => aliases.has(a.id)).length
  const aliasPct = total > 0 ? Math.round((aliasCount / total) * 100) : 0

  // Activity hour histogram (local clock hour of lastActiveAt)
  const hour = new Array<number>(24).fill(0)
  for (const a of agents) {
    if (typeof a.lastActiveAt === 'number') {
      const d = new Date(a.lastActiveAt)
      const h = d.getHours()
      if (h >= 0 && h <= 23) hour[h] += 1
    }
  }

  return {
    statusDistribution,
    aliasCount,
    totalAgents: total,
    aliasPct,
    activityHourHistogram: hour,
  }
}
