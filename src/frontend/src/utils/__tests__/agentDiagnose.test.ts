import { describe, it, expect } from 'vitest'
import { diagnoseAgent } from '../agentDiagnose'
import type { AgentDiagnoseInput } from '../agentDiagnose'

const HOUR_MS = 3_600_000
const MIN_MS = 60_000

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeInput(overrides: Partial<AgentDiagnoseInput> = {}): AgentDiagnoseInput {
  return {
    agent: {},
    sessions: [],
    history: [],
    now: Date.now(),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// 1. idle_check
// ---------------------------------------------------------------------------

describe('diagnoseAgent — idle_check', () => {
  it('fires warning when lastActivity is > 24h ago', () => {
    const now = Date.now()
    const findings = diagnoseAgent(
      makeInput({
        agent: { lastActivity: new Date(now - 25 * HOUR_MS).toISOString() },
        now,
      }),
    )
    const f = findings.find((x) => x.check === 'idle_check')
    expect(f).toBeDefined()
    expect(f!.severity).toBe('warning')
    expect(f!.message).toMatch(/小時無活動/)
    expect(f!.meta?.idleHours).toBeGreaterThan(24)
  })

  it('does NOT fire when lastActivity is <= 24h ago', () => {
    const now = Date.now()
    const findings = diagnoseAgent(
      makeInput({
        agent: { lastActivity: new Date(now - 23 * HOUR_MS).toISOString() },
        now,
      }),
    )
    expect(findings.find((x) => x.check === 'idle_check')).toBeUndefined()
  })

  it('does NOT fire when lastActivity is missing', () => {
    // missing lastActivity → NaN → isFinite(NaN) = false → skipped
    const findings = diagnoseAgent(makeInput({ agent: {} }))
    expect(findings.find((x) => x.check === 'idle_check')).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// 2. session_burst
// ---------------------------------------------------------------------------

describe('diagnoseAgent — session_burst', () => {
  it('fires info when today sessions > 3× 7-day avg AND >= 3', () => {
    // Simulate: 0 sessions in past 7 days, 5 sessions today
    const now = new Date('2025-01-15T14:00:00Z').getTime()
    const todayStart = new Date('2025-01-15T00:00:00Z').getTime()

    const todaySessions = Array.from({ length: 5 }, (_, i) => ({
      id: `s-today-${i}`,
      lastTs: new Date(todayStart + i * HOUR_MS).toISOString(),
    }))

    const findings = diagnoseAgent(
      makeInput({
        sessions: todaySessions,
        now,
      }),
    )
    const f = findings.find((x) => x.check === 'session_burst')
    expect(f).toBeDefined()
    expect(f!.severity).toBe('info')
    expect(f!.message).toContain('今日')
    expect(f!.meta?.todaySessions).toBe(5)
  })

  it('does NOT fire when today sessions < 3', () => {
    const now = new Date('2025-01-15T14:00:00Z').getTime()
    const todayStart = new Date('2025-01-15T00:00:00Z').getTime()

    const findings = diagnoseAgent(
      makeInput({
        sessions: [{ id: 's1', lastTs: new Date(todayStart + HOUR_MS).toISOString() }],
        now,
      }),
    )
    expect(findings.find((x) => x.check === 'session_burst')).toBeUndefined()
  })

  it('does NOT fire when today sessions <= 3× daily average', () => {
    const now = new Date('2025-01-15T14:00:00Z').getTime()
    const todayStart = new Date('2025-01-15T00:00:00Z').getTime()
    const weekStart = todayStart - 7 * 24 * HOUR_MS

    // 21 sessions last week (3/day avg), 3 sessions today → 3 == 3×avg (not strictly >)
    const lastWeekSessions = Array.from({ length: 21 }, (_, i) => ({
      id: `s-week-${i}`,
      lastTs: new Date(weekStart + i * HOUR_MS).toISOString(),
    }))
    const todaySessions = Array.from({ length: 3 }, (_, i) => ({
      id: `s-today-${i}`,
      lastTs: new Date(todayStart + i * HOUR_MS).toISOString(),
    }))

    const findings = diagnoseAgent(
      makeInput({
        sessions: [...lastWeekSessions, ...todaySessions],
        now,
      }),
    )
    expect(findings.find((x) => x.check === 'session_burst')).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// 3. cost_spike_24h
// ---------------------------------------------------------------------------

describe('diagnoseAgent — cost_spike_24h', () => {
  it('fires warning when recent 24h cost > 2× prev 24h AND > $0.10', () => {
    const now = Date.now()
    const recent = [
      { timestamp: new Date(now - HOUR_MS).toISOString(), cost: 0.5, input_tokens: 100, output_tokens: 50 },
    ]
    const prev = [
      { timestamp: new Date(now - 30 * HOUR_MS).toISOString(), cost: 0.1, input_tokens: 50, output_tokens: 25 },
    ]

    const findings = diagnoseAgent(
      makeInput({
        history: [...recent, ...prev],
        now,
      }),
    )
    const f = findings.find((x) => x.check === 'cost_spike_24h')
    expect(f).toBeDefined()
    expect(f!.severity).toBe('warning')
    expect(f!.message).toContain('暴增')
    expect(f!.meta?.recent24hCost).toBeCloseTo(0.5)
  })

  it('does NOT fire when recent cost is <= 2× prev cost', () => {
    const now = Date.now()
    const recent = [
      { timestamp: new Date(now - HOUR_MS).toISOString(), cost: 0.2, input_tokens: 100, output_tokens: 50 },
    ]
    const prev = [
      { timestamp: new Date(now - 30 * HOUR_MS).toISOString(), cost: 0.15, input_tokens: 50, output_tokens: 25 },
    ]

    const findings = diagnoseAgent(makeInput({ history: [...recent, ...prev], now }))
    expect(findings.find((x) => x.check === 'cost_spike_24h')).toBeUndefined()
  })

  it('does NOT fire when recent cost <= $0.10 even if ratio is high', () => {
    const now = Date.now()
    const recent = [
      { timestamp: new Date(now - HOUR_MS).toISOString(), cost: 0.09, input_tokens: 10, output_tokens: 5 },
    ]
    // prev cost = 0 → ratio would be ∞ but 0.09 <= 0.10 threshold
    const findings = diagnoseAgent(makeInput({ history: recent, now }))
    expect(findings.find((x) => x.check === 'cost_spike_24h')).toBeUndefined()
  })

  it('shows ∞ ratio when prev cost is 0 but recent > $0.10', () => {
    const now = Date.now()
    const recent = [
      { timestamp: new Date(now - HOUR_MS).toISOString(), cost: 0.5, input_tokens: 100, output_tokens: 50 },
    ]
    const findings = diagnoseAgent(makeInput({ history: recent, now }))
    const f = findings.find((x) => x.check === 'cost_spike_24h')
    expect(f).toBeDefined()
    expect(f!.message).toContain('∞')
  })
})

// ---------------------------------------------------------------------------
// 4. token_imbalance
// ---------------------------------------------------------------------------

describe('diagnoseAgent — token_imbalance', () => {
  it('fires warning when input > 1000 and output < 10% of input', () => {
    const findings = diagnoseAgent(
      makeInput({
        agent: { tokens: { input: 5000, output: 100 } },
      }),
    )
    const f = findings.find((x) => x.check === 'token_imbalance')
    expect(f).toBeDefined()
    expect(f!.severity).toBe('warning')
    expect(f!.message).toContain('Output token 異常少')
    expect(f!.meta?.input_t).toBe(5000)
    expect(f!.meta?.output_t).toBe(100)
  })

  it('does NOT fire when output is >= 10% of input', () => {
    const findings = diagnoseAgent(
      makeInput({
        agent: { tokens: { input: 5000, output: 600 } },
      }),
    )
    expect(findings.find((x) => x.check === 'token_imbalance')).toBeUndefined()
  })

  it('does NOT fire when input is <= 1000', () => {
    const findings = diagnoseAgent(
      makeInput({
        agent: { tokens: { input: 800, output: 10 } },
      }),
    )
    expect(findings.find((x) => x.check === 'token_imbalance')).toBeUndefined()
  })

  it('does NOT fire when tokens field is absent', () => {
    const findings = diagnoseAgent(makeInput({ agent: {} }))
    expect(findings.find((x) => x.check === 'token_imbalance')).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// 5. stuck_session
// ---------------------------------------------------------------------------

describe('diagnoseAgent — stuck_session', () => {
  it('fires warning when startedAt (ISO string) is > 30 min ago', () => {
    const now = Date.now()
    const findings = diagnoseAgent(
      makeInput({
        agent: {
          currentTask: {
            task: 'doing something',
            startedAt: new Date(now - 45 * MIN_MS).toISOString(),
          },
        },
        now,
      }),
    )
    const f = findings.find((x) => x.check === 'stuck_session')
    expect(f).toBeDefined()
    expect(f!.severity).toBe('warning')
    expect(f!.message).toContain('分鐘未結束')
    expect((f!.meta?.stuckMin as number)).toBeGreaterThan(30)
  })

  it('fires warning when startedAt is a numeric epoch ms', () => {
    const now = Date.now()
    const findings = diagnoseAgent(
      makeInput({
        agent: {
          currentTask: {
            task: 'numeric epoch test',
            startedAt: now - 40 * MIN_MS,
          },
        },
        now,
      }),
    )
    const f = findings.find((x) => x.check === 'stuck_session')
    expect(f).toBeDefined()
    expect(f!.message).toContain('分鐘未結束')
  })

  it('does NOT fire when startedAt is < 30 min ago', () => {
    const now = Date.now()
    const findings = diagnoseAgent(
      makeInput({
        agent: {
          currentTask: {
            task: 'fast task',
            startedAt: new Date(now - 10 * MIN_MS).toISOString(),
          },
        },
        now,
      }),
    )
    expect(findings.find((x) => x.check === 'stuck_session')).toBeUndefined()
  })

  it('does NOT fire when currentTask has no startedAt', () => {
    // currentTask exists but startedAt is absent → skip check
    const findings = diagnoseAgent(
      makeInput({
        agent: { currentTask: { task: 'no start time' } },
      }),
    )
    expect(findings.find((x) => x.check === 'stuck_session')).toBeUndefined()
  })

  it('does NOT fire when currentTask is absent entirely', () => {
    const findings = diagnoseAgent(makeInput({ agent: {} }))
    expect(findings.find((x) => x.check === 'stuck_session')).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// 6. healthy fallback
// ---------------------------------------------------------------------------

describe('diagnoseAgent — healthy fallback', () => {
  it('returns healthy finding when no checks fire', () => {
    const now = Date.now()
    const findings = diagnoseAgent(
      makeInput({
        agent: {
          lastActivity: new Date(now - HOUR_MS).toISOString(),
          tokens: { input: 500, output: 200 },
        },
        sessions: [],
        history: [],
        now,
      }),
    )
    expect(findings).toHaveLength(1)
    const f = findings[0]
    expect(f.check).toBe('healthy')
    expect(f.severity).toBe('ok')
    expect(f.message).toContain('正常')
  })

  it('does NOT emit healthy when at least one finding exists', () => {
    const now = Date.now()
    // trigger idle_check
    const findings = diagnoseAgent(
      makeInput({
        agent: { lastActivity: new Date(now - 30 * HOUR_MS).toISOString() },
        now,
      }),
    )
    expect(findings.find((x) => x.check === 'healthy')).toBeUndefined()
    expect(findings.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// 7. now override
// ---------------------------------------------------------------------------

describe('diagnoseAgent — now override', () => {
  it('uses provided now instead of Date.now()', () => {
    const fixedNow = new Date('2025-06-01T12:00:00Z').getTime()
    // lastActivity 30h before fixedNow
    const lastActivity = new Date(fixedNow - 30 * HOUR_MS).toISOString()

    const findings = diagnoseAgent(
      makeInput({
        agent: { lastActivity },
        now: fixedNow,
      }),
    )
    const f = findings.find((x) => x.check === 'idle_check')
    expect(f).toBeDefined()
    expect(f!.message).toContain('30 小時無活動')
  })
})

// ---------------------------------------------------------------------------
// 8. multiple findings can co-exist
// ---------------------------------------------------------------------------

describe('diagnoseAgent — multiple findings', () => {
  it('can fire both idle_check and token_imbalance simultaneously', () => {
    const now = Date.now()
    const findings = diagnoseAgent(
      makeInput({
        agent: {
          lastActivity: new Date(now - 48 * HOUR_MS).toISOString(),
          tokens: { input: 10_000, output: 50 },
        },
        now,
      }),
    )
    expect(findings.find((x) => x.check === 'idle_check')).toBeDefined()
    expect(findings.find((x) => x.check === 'token_imbalance')).toBeDefined()
    // no healthy when issues present
    expect(findings.find((x) => x.check === 'healthy')).toBeUndefined()
  })
})
