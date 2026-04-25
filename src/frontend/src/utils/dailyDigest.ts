export interface DigestAgent {
  id: string
  status?: string
  costs?: { today?: number; yesterday?: number; month?: number; total?: number }
}

export interface DigestSubAgent {
  status?: string
}

export interface DigestAlert {
  severity: string
  ts?: number
}

export interface DigestInput {
  agents?: DigestAgent[]
  subagents?: DigestSubAgent[]
  alerts?: DigestAlert[]
  errorCount?: number
  date?: string // YYYY-MM-DD; default today local
}

export function buildDigest(input: DigestInput): string {
  const date = input.date ?? new Date().toISOString().slice(0, 10)
  const agents = input.agents ?? []
  const subagents = input.subagents ?? []
  const alerts = input.alerts ?? []

  const totalAgents = agents.length
  const activeCount = agents.filter(a => /active/i.test(a.status ?? '')).length

  const criticalCount = alerts.filter(a => a.severity === 'critical').length
  const warningCount = alerts.filter(a => a.severity === 'warning').length

  const totalToday = agents.reduce((s, a) => s + (a.costs?.today ?? 0), 0)
  const totalYesterday = agents.reduce((s, a) => s + (a.costs?.yesterday ?? 0), 0)
  const deltaPct =
    totalYesterday > 0 ? ((totalToday - totalYesterday) / totalYesterday) * 100 : 0

  const topSpender = [...agents].sort(
    (a, b) => (b.costs?.month ?? 0) - (a.costs?.month ?? 0),
  )[0]

  const subTotal = subagents.length
  const subIdle = subagents.filter(s => s.status === 'idle').length
  const errCount = input.errorCount ?? 0

  // Line 1 — title
  const line1 = `📊 Daily Digest (${date})`

  // Line 2 — agents + alert hint
  const alertHint =
    criticalCount > 0
      ? `🔴 critical: ${criticalCount}`
      : warningCount > 0
        ? `🟠 warning: ${warningCount}`
        : '✅ no active alerts'
  const line2 = `• ${totalAgents} agents, ${activeCount} active (${alertHint})`

  // Line 3 — today cost + delta
  const deltaArrow = deltaPct > 5 ? '↑' : deltaPct < -5 ? '↓' : '≈'
  const deltaStr =
    totalYesterday > 0
      ? ` (${deltaArrow} ${Math.abs(deltaPct).toFixed(0)}% vs yesterday)`
      : ''
  const line3 = `• Today cost: $${totalToday.toFixed(2)}${deltaStr}`

  // Line 4 — top spender
  const line4 = topSpender
    ? `• Top spender: ${topSpender.id} ($${(topSpender.costs?.month ?? 0).toFixed(2)} this month)`
    : `• Top spender: 無資料`

  // Line 5 — errors + sub-agents
  const line5 = `• Errors last hour: ${errCount}; Sub-agents: ${subTotal} (${subIdle} idle)`

  return [line1, line2, line3, line4, line5].join('\n')
}
