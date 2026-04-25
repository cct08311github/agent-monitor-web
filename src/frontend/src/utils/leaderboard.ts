export interface AgentLike {
  id: string
  costs?: { month?: number; total?: number; today?: number }
  tokens?: { total?: number; input?: number; output?: number }
}

export interface ActivitySummary {
  agent_id: string
  active_minutes: number
  last_seen?: string
}

export interface LeaderboardEntry {
  rank: number      // 1-based
  agentId: string
  value: number
}

const NUMERIC_NAN_GUARD = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

export function topByCost(agents: AgentLike[], n: number = 5): LeaderboardEntry[] {
  return agents
    .map(a => ({ agentId: a.id, value: NUMERIC_NAN_GUARD(a.costs?.month ?? a.costs?.total) }))
    .filter(e => e.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, n)
    .map((e, i) => ({ rank: i + 1, agentId: e.agentId, value: e.value }))
}

export function topByTokens(agents: AgentLike[], n: number = 5): LeaderboardEntry[] {
  return agents
    .map(a => ({ agentId: a.id, value: NUMERIC_NAN_GUARD(a.tokens?.total) }))
    .filter(e => e.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, n)
    .map((e, i) => ({ rank: i + 1, agentId: e.agentId, value: e.value }))
}

export function topByActivity(activitySummary: ActivitySummary[], n: number = 5): LeaderboardEntry[] {
  return activitySummary
    .map(a => ({ agentId: a.agent_id, value: NUMERIC_NAN_GUARD(a.active_minutes) }))
    .filter(e => e.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, n)
    .map((e, i) => ({ rank: i + 1, agentId: e.agentId, value: e.value }))
}

export function rankEmoji(rank: number): string {
  if (rank === 1) return '🥇'
  if (rank === 2) return '🥈'
  if (rank === 3) return '🥉'
  return `#${rank}`
}
