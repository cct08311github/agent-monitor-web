// ---------------------------------------------------------------------------
// agentDiagnose.ts — Static rule-based diagnostic checks for an agent snapshot
// ---------------------------------------------------------------------------

export type Severity = 'critical' | 'warning' | 'info' | 'ok'

export interface DiagnosticFinding {
  check: string
  severity: Severity
  message: string
  meta?: Record<string, unknown>
}

export interface AgentDiagnoseInput {
  agent: {
    lastActivity?: string
    tokens?: { input?: number; output?: number; total?: number }
    currentTask?: { task?: string; startedAt?: string | number }
  }
  sessions: { id: string; messageCount?: number; lastTs?: string }[]
  history: { timestamp: string; cost: number; input_tokens: number; output_tokens: number }[]
  now?: number // override for testing
}

/**
 * Run a set of static diagnostic checks against an agent snapshot.
 * Returns an array of DiagnosticFinding; always contains at least one entry
 * (healthy fallback when no issues are detected).
 *
 * Checks (in order):
 *   1. idle_check       — last activity > 24 h ago
 *   2. session_burst    — today's sessions > 3× 7-day daily average AND >= 3
 *   3. cost_spike_24h   — recent 24 h cost > 2× prior 24 h cost AND > $0.10
 *   4. token_imbalance  — output tokens < 10% of input tokens (input > 1000)
 *   5. stuck_session    — currentTask.startedAt older than 30 min
 *   6. healthy          — fallback when no other check fires
 */
export function diagnoseAgent(input: AgentDiagnoseInput): DiagnosticFinding[] {
  const now = input.now ?? Date.now()
  const findings: DiagnosticFinding[] = []

  // 1. idle_check
  const lastTs = input.agent.lastActivity ? Date.parse(input.agent.lastActivity) : NaN
  if (Number.isFinite(lastTs)) {
    const idleHours = (now - lastTs) / 3_600_000
    if (idleHours > 24) {
      findings.push({
        check: 'idle_check',
        severity: 'warning',
        message: `Agent 已 ${Math.floor(idleHours)} 小時無活動`,
        meta: { idleHours },
      })
    }
  }

  // 2. session_burst — today vs 7-day daily average
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const todayStart = today.getTime()
  const weekStart = todayStart - 7 * 24 * 3_600_000

  const todaySessions = input.sessions.filter((s) => {
    const ts = s.lastTs ? Date.parse(s.lastTs) : NaN
    return Number.isFinite(ts) && ts >= todayStart
  }).length

  const lastWeekSessions = input.sessions.filter((s) => {
    const ts = s.lastTs ? Date.parse(s.lastTs) : NaN
    return Number.isFinite(ts) && ts >= weekStart && ts < todayStart
  }).length

  const dailyAvg = lastWeekSessions / 7
  if (todaySessions > dailyAvg * 3 && todaySessions >= 3) {
    findings.push({
      check: 'session_burst',
      severity: 'info',
      message: `Session 數異常增加（今日 ${todaySessions} vs 7 日平均 ${dailyAvg.toFixed(1)}）`,
      meta: { todaySessions, dailyAvg },
    })
  }

  // 3. cost_spike_24h
  const cutoff24h = now - 24 * 3_600_000
  const cutoff48h = now - 48 * 3_600_000

  const recent24hCost = input.history
    .filter((h) => {
      const ts = Date.parse(h.timestamp)
      return Number.isFinite(ts) && ts >= cutoff24h
    })
    .reduce((s, h) => s + h.cost, 0)

  const prev24hCost = input.history
    .filter((h) => {
      const ts = Date.parse(h.timestamp)
      return Number.isFinite(ts) && ts >= cutoff48h && ts < cutoff24h
    })
    .reduce((s, h) => s + h.cost, 0)

  if (recent24hCost > prev24hCost * 2 && recent24hCost > 0.1) {
    const ratio = prev24hCost > 0 ? (recent24hCost / prev24hCost).toFixed(1) : '∞'
    findings.push({
      check: 'cost_spike_24h',
      severity: 'warning',
      message: `近 24h cost 暴增 ${ratio}× ($${recent24hCost.toFixed(2)} vs 前 24h $${prev24hCost.toFixed(2)})`,
      meta: { recent24hCost, prev24hCost },
    })
  }

  // 4. token_imbalance
  const input_t = input.agent.tokens?.input ?? 0
  const output_t = input.agent.tokens?.output ?? 0
  if (input_t > 1000 && output_t < input_t * 0.1) {
    findings.push({
      check: 'token_imbalance',
      severity: 'warning',
      message: `Output token 異常少（input ${input_t.toLocaleString()}, output ${output_t.toLocaleString()}）— 可能卡住或被 throttle`,
      meta: { input_t, output_t },
    })
  }

  // 5. stuck_session — currentTask.startedAt > 30 min
  const startedAt = input.agent.currentTask?.startedAt
  if (startedAt !== undefined && startedAt !== null) {
    const startedMs =
      typeof startedAt === 'number' ? startedAt : Date.parse(startedAt as string)
    if (Number.isFinite(startedMs)) {
      const stuckMin = (now - startedMs) / 60_000
      if (stuckMin > 30) {
        findings.push({
          check: 'stuck_session',
          severity: 'warning',
          message: `當前任務持續 ${Math.floor(stuckMin)} 分鐘未結束`,
          meta: { stuckMin },
        })
      }
    }
  }

  // 6. healthy fallback
  if (findings.length === 0) {
    findings.push({
      check: 'healthy',
      severity: 'ok',
      message: 'Agent 一切正常 ✓',
    })
  }

  return findings
}
