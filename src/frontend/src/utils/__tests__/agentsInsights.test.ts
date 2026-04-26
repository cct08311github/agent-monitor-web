import { describe, it, expect } from 'vitest'
import { computeAgentsInsights } from '../agentsInsights'
import type { AgentLike } from '../agentsInsights'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAgent(overrides: Partial<AgentLike> & { id: string }): AgentLike {
  return {
    status: 'active_executing',
    name: 'Agent ' + overrides.id,
    lastActiveAt: null,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('computeAgentsInsights', () => {
  it('empty agents → all empty/zero', () => {
    const result = computeAgentsInsights([], new Map())
    expect(result.totalAgents).toBe(0)
    expect(result.statusDistribution).toEqual([])
    expect(result.aliasCount).toBe(0)
    expect(result.aliasPct).toBe(0)
    expect(result.activityHourHistogram).toHaveLength(24)
    expect(result.activityHourHistogram.every((v) => v === 0)).toBe(true)
  })

  it('statusDistribution sorted by count desc', () => {
    const agents: AgentLike[] = [
      makeAgent({ id: 'a1', status: 'dormant' }),
      makeAgent({ id: 'a2', status: 'dormant' }),
      makeAgent({ id: 'a3', status: 'dormant' }),
      makeAgent({ id: 'a4', status: 'active_executing' }),
      makeAgent({ id: 'a5', status: 'active_executing' }),
      makeAgent({ id: 'a6', status: 'offline' }),
    ]
    const { statusDistribution } = computeAgentsInsights(agents, new Map())
    expect(statusDistribution[0].label).toBe('dormant')
    expect(statusDistribution[0].count).toBe(3)
    expect(statusDistribution[1].label).toBe('active_executing')
    expect(statusDistribution[1].count).toBe(2)
    expect(statusDistribution[2].label).toBe('offline')
    expect(statusDistribution[2].count).toBe(1)
  })

  it('statusDistribution case-insensitive normalization', () => {
    const agents: AgentLike[] = [
      makeAgent({ id: 'a1', status: 'ACTIVE_EXECUTING' }),
      makeAgent({ id: 'a2', status: 'Active_Recent' }),
      makeAgent({ id: 'a3', status: 'dormant' }),
    ]
    const { statusDistribution } = computeAgentsInsights(agents, new Map())
    const labels = statusDistribution.map((i) => i.label)
    expect(labels).toContain('active_executing')
    expect(labels).toContain('active_recent')
    expect(labels).toContain('dormant')
  })

  it('tied counts broken alphabetically', () => {
    const agents: AgentLike[] = [
      makeAgent({ id: 'a1', status: 'offline' }),
      makeAgent({ id: 'a2', status: 'dormant' }),
    ]
    const { statusDistribution } = computeAgentsInsights(agents, new Map())
    // both count=1, so alphabetical: dormant < offline
    expect(statusDistribution[0].label).toBe('dormant')
    expect(statusDistribution[1].label).toBe('offline')
  })

  it('aliasUsage counts agents with alias entry in map', () => {
    const agents: AgentLike[] = [
      makeAgent({ id: 'agent-1' }),
      makeAgent({ id: 'agent-2' }),
      makeAgent({ id: 'agent-3' }),
    ]
    const aliases = new Map<string, string>([
      ['agent-1', 'My Bot'],
      ['agent-3', 'Worker'],
    ])
    const result = computeAgentsInsights(agents, aliases)
    expect(result.aliasCount).toBe(2)
    expect(result.aliasPct).toBe(67)
  })

  it('hourHistogram has exactly 24 buckets', () => {
    const result = computeAgentsInsights([], new Map())
    expect(result.activityHourHistogram).toHaveLength(24)
  })

  it('hour bucket index matches lastActiveAt hour', () => {
    // Use a fixed timestamp at a known hour to avoid timezone flakiness:
    // 2024-01-15T14:30:00Z — at UTC+0 this is hour 14,
    // but we test with local time using Date().getHours() for correctness.
    const ts = new Date(2024, 0, 15, 14, 30, 0).getTime() // local hour 14
    const agents: AgentLike[] = [makeAgent({ id: 'a1', lastActiveAt: ts })]
    const { activityHourHistogram } = computeAgentsInsights(agents, new Map())
    expect(activityHourHistogram[14]).toBe(1)
    // All other hours should be 0
    const otherHours = activityHourHistogram.filter((_, i) => i !== 14)
    expect(otherHours.every((v) => v === 0)).toBe(true)
  })

  it('missing lastActiveAt (null/undefined) does not crash and is skipped', () => {
    const agents: AgentLike[] = [
      makeAgent({ id: 'a1', lastActiveAt: null }),
      makeAgent({ id: 'a2', lastActiveAt: undefined }),
      makeAgent({ id: 'a3' }), // no lastActiveAt key
    ]
    const { activityHourHistogram } = computeAgentsInsights(agents, new Map())
    expect(activityHourHistogram.every((v) => v === 0)).toBe(true)
  })

  it('pct is rounded integer for statusDistribution', () => {
    const agents: AgentLike[] = [
      makeAgent({ id: 'a1', status: 'active_executing' }),
      makeAgent({ id: 'a2', status: 'active_executing' }),
      makeAgent({ id: 'a3', status: 'dormant' }),
    ]
    const { statusDistribution } = computeAgentsInsights(agents, new Map())
    for (const item of statusDistribution) {
      expect(Number.isInteger(item.pct)).toBe(true)
      expect(item.pct).toBeGreaterThanOrEqual(0)
      expect(item.pct).toBeLessThanOrEqual(100)
    }
  })

  it('unknown/null status is normalized to "unknown"', () => {
    const agents: AgentLike[] = [
      makeAgent({ id: 'a1', status: null }),
      makeAgent({ id: 'a2', status: undefined }),
    ]
    const { statusDistribution } = computeAgentsInsights(agents, new Map())
    expect(statusDistribution.length).toBe(1)
    expect(statusDistribution[0].label).toBe('unknown')
    expect(statusDistribution[0].count).toBe(2)
  })

  it('multiple agents same hour accumulate in correct bucket', () => {
    const ts = new Date(2024, 3, 20, 9, 0, 0).getTime() // local hour 9
    const agents: AgentLike[] = [
      makeAgent({ id: 'a1', lastActiveAt: ts }),
      makeAgent({ id: 'a2', lastActiveAt: ts }),
      makeAgent({ id: 'a3', lastActiveAt: ts }),
    ]
    const { activityHourHistogram } = computeAgentsInsights(agents, new Map())
    expect(activityHourHistogram[9]).toBe(3)
  })
})
