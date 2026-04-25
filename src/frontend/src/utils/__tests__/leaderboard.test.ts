import { describe, it, expect } from 'vitest'
import {
  topByCost,
  topByTokens,
  topByActivity,
  rankEmoji,
  type AgentLike,
  type ActivitySummary,
} from '../leaderboard'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAgent(id: string, costMonth?: number, tokensTotal?: number): AgentLike {
  return {
    id,
    costs: costMonth !== undefined ? { month: costMonth } : undefined,
    tokens: tokensTotal !== undefined ? { total: tokensTotal } : undefined,
  }
}

function makeActivity(agent_id: string, active_minutes: number): ActivitySummary {
  return { agent_id, active_minutes }
}

// ---------------------------------------------------------------------------
// topByCost
// ---------------------------------------------------------------------------

describe('topByCost', () => {
  it('sorts agents by cost descending', () => {
    const agents = [
      makeAgent('b', 5),
      makeAgent('a', 20),
      makeAgent('c', 10),
    ]
    const result = topByCost(agents)
    expect(result[0].agentId).toBe('a')
    expect(result[1].agentId).toBe('c')
    expect(result[2].agentId).toBe('b')
  })

  it('slices to top 5 by default', () => {
    const agents = Array.from({ length: 8 }, (_, i) =>
      makeAgent(`agent-${i}`, i + 1),
    )
    const result = topByCost(agents)
    expect(result).toHaveLength(5)
  })

  it('respects custom n parameter', () => {
    const agents = Array.from({ length: 8 }, (_, i) =>
      makeAgent(`agent-${i}`, i + 1),
    )
    const result = topByCost(agents, 3)
    expect(result).toHaveLength(3)
  })

  it('filters out agents with cost === 0', () => {
    const agents = [
      makeAgent('has-cost', 10),
      makeAgent('zero-cost', 0),
      makeAgent('no-cost'),
    ]
    const result = topByCost(agents)
    expect(result).toHaveLength(1)
    expect(result[0].agentId).toBe('has-cost')
  })

  it('assigns correct 1-based rank', () => {
    const agents = [
      makeAgent('b', 5),
      makeAgent('a', 20),
    ]
    const result = topByCost(agents)
    expect(result[0].rank).toBe(1)
    expect(result[1].rank).toBe(2)
  })

  it('NaN guard: treats NaN cost as 0 and filters it out', () => {
    const agents: AgentLike[] = [
      { id: 'nan-agent', costs: { month: NaN } },
      { id: 'valid-agent', costs: { month: 5 } },
    ]
    const result = topByCost(agents)
    expect(result).toHaveLength(1)
    expect(result[0].agentId).toBe('valid-agent')
  })

  it('falls back to costs.total when costs.month is undefined', () => {
    const agents: AgentLike[] = [
      { id: 'total-only', costs: { total: 15 } },
      { id: 'month-wins', costs: { month: 20, total: 5 } },
    ]
    const result = topByCost(agents)
    expect(result[0].agentId).toBe('month-wins')
    expect(result[0].value).toBe(20)
    expect(result[1].agentId).toBe('total-only')
    expect(result[1].value).toBe(15)
  })

  it('returns empty array when all agents have zero cost', () => {
    const agents = [makeAgent('a', 0), makeAgent('b', 0)]
    expect(topByCost(agents)).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// topByTokens
// ---------------------------------------------------------------------------

describe('topByTokens', () => {
  it('sorts agents by tokens descending', () => {
    const agents = [
      makeAgent('b', undefined, 500),
      makeAgent('a', undefined, 2000),
      makeAgent('c', undefined, 1000),
    ]
    const result = topByTokens(agents)
    expect(result[0].agentId).toBe('a')
    expect(result[1].agentId).toBe('c')
    expect(result[2].agentId).toBe('b')
  })

  it('slices to top 5 by default', () => {
    const agents = Array.from({ length: 8 }, (_, i) =>
      makeAgent(`agent-${i}`, undefined, (i + 1) * 100),
    )
    const result = topByTokens(agents)
    expect(result).toHaveLength(5)
  })

  it('filters out agents with zero tokens', () => {
    const agents = [
      makeAgent('with-tokens', undefined, 500),
      makeAgent('no-tokens', undefined, 0),
      makeAgent('undefined-tokens'),
    ]
    const result = topByTokens(agents)
    expect(result).toHaveLength(1)
    expect(result[0].agentId).toBe('with-tokens')
  })

  it('NaN guard: treats NaN tokens as 0 and filters it out', () => {
    const agents: AgentLike[] = [
      { id: 'nan-agent', tokens: { total: NaN } },
      { id: 'valid-agent', tokens: { total: 1000 } },
    ]
    const result = topByTokens(agents)
    expect(result).toHaveLength(1)
    expect(result[0].agentId).toBe('valid-agent')
  })

  it('assigns correct 1-based rank', () => {
    const agents = [
      makeAgent('b', undefined, 100),
      makeAgent('a', undefined, 500),
    ]
    const result = topByTokens(agents)
    expect(result[0].rank).toBe(1)
    expect(result[1].rank).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// topByActivity
// ---------------------------------------------------------------------------

describe('topByActivity', () => {
  it('sorts activity by active_minutes descending', () => {
    const summary = [
      makeActivity('b', 30),
      makeActivity('a', 120),
      makeActivity('c', 60),
    ]
    const result = topByActivity(summary)
    expect(result[0].agentId).toBe('a')
    expect(result[1].agentId).toBe('c')
    expect(result[2].agentId).toBe('b')
  })

  it('slices to top 5 by default', () => {
    const summary = Array.from({ length: 8 }, (_, i) =>
      makeActivity(`agent-${i}`, (i + 1) * 10),
    )
    const result = topByActivity(summary)
    expect(result).toHaveLength(5)
  })

  it('filters out agents with zero active_minutes', () => {
    const summary = [
      makeActivity('active', 45),
      makeActivity('idle', 0),
    ]
    const result = topByActivity(summary)
    expect(result).toHaveLength(1)
    expect(result[0].agentId).toBe('active')
  })

  it('NaN guard: treats NaN active_minutes as 0 and filters it out', () => {
    const summary: ActivitySummary[] = [
      { agent_id: 'nan-agent', active_minutes: NaN },
      { agent_id: 'valid-agent', active_minutes: 30 },
    ]
    const result = topByActivity(summary)
    expect(result).toHaveLength(1)
    expect(result[0].agentId).toBe('valid-agent')
  })

  it('assigns correct 1-based rank', () => {
    const summary = [
      makeActivity('b', 10),
      makeActivity('a', 90),
    ]
    const result = topByActivity(summary)
    expect(result[0].rank).toBe(1)
    expect(result[1].rank).toBe(2)
  })

  it('returns empty array when all active_minutes are zero', () => {
    const summary = [makeActivity('a', 0), makeActivity('b', 0)]
    expect(topByActivity(summary)).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// rankEmoji
// ---------------------------------------------------------------------------

describe('rankEmoji', () => {
  it('returns gold medal for rank 1', () => {
    expect(rankEmoji(1)).toBe('🥇')
  })

  it('returns silver medal for rank 2', () => {
    expect(rankEmoji(2)).toBe('🥈')
  })

  it('returns bronze medal for rank 3', () => {
    expect(rankEmoji(3)).toBe('🥉')
  })

  it('returns #N for rank 4 and beyond', () => {
    expect(rankEmoji(4)).toBe('#4')
    expect(rankEmoji(5)).toBe('#5')
    expect(rankEmoji(10)).toBe('#10')
  })
})
