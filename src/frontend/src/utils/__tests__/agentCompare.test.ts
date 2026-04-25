import { describe, it, expect } from 'vitest'
import { buildComparison } from '../agentCompare'
import type { CompareAgentLike } from '../agentCompare'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAgent(overrides: Partial<CompareAgentLike> = {}): CompareAgentLike {
  return {
    id: 'test-agent',
    model: 'claude-sonnet-4-6',
    status: 'active_recent',
    lastActivity: '2024-01-01T10:00:00Z',
    costs: { month: 5.0, total: 20.0, today: 1.0 },
    tokens: { total: 100_000, input: 60_000, output: 40_000 },
    currentTask: { task: 'running' },
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// buildComparison tests
// ---------------------------------------------------------------------------

describe('buildComparison', () => {
  it('returns 8 rows (3 info + 5 numeric)', () => {
    const a = makeAgent({ id: 'agent-a' })
    const b = makeAgent({ id: 'agent-b' })
    const rows = buildComparison(a, b)
    expect(rows).toHaveLength(8)
  })

  it('info rows (Model, Status, Last Activity) always have winner=na', () => {
    const a = makeAgent({ id: 'agent-a', model: 'gpt-4' })
    const b = makeAgent({ id: 'agent-b', model: 'claude-3' })
    const rows = buildComparison(a, b)
    const infoRows = rows.filter((r) => r.direction === 'none')
    expect(infoRows).toHaveLength(3)
    infoRows.forEach((r) => expect(r.winner).toBe('na'))
  })

  it('lower-is-better: A wins when A cost < B cost', () => {
    const a = makeAgent({ id: 'a', costs: { month: 1.0, total: 5.0 } })
    const b = makeAgent({ id: 'b', costs: { month: 3.0, total: 10.0 } })
    const rows = buildComparison(a, b)
    const monthRow = rows.find((r) => r.label === 'Cost (month)')!
    expect(monthRow.winner).toBe('A')
  })

  it('lower-is-better: B wins when B cost < A cost', () => {
    const a = makeAgent({ id: 'a', costs: { month: 5.0, total: 20.0 } })
    const b = makeAgent({ id: 'b', costs: { month: 1.0, total: 5.0 } })
    const rows = buildComparison(a, b)
    const monthRow = rows.find((r) => r.label === 'Cost (month)')!
    expect(monthRow.winner).toBe('B')
  })

  it('higher-is-better: A wins when A tokens > B tokens', () => {
    const a = makeAgent({ id: 'a', tokens: { total: 200_000, input: 120_000, output: 80_000 } })
    const b = makeAgent({ id: 'b', tokens: { total: 50_000, input: 30_000, output: 20_000 } })
    const rows = buildComparison(a, b)
    const totalTokRow = rows.find((r) => r.label === 'Tokens (total)')!
    expect(totalTokRow.winner).toBe('A')
  })

  it('higher-is-better: B wins when B tokens > A tokens', () => {
    const a = makeAgent({ id: 'a', tokens: { total: 10_000, input: 6_000, output: 4_000 } })
    const b = makeAgent({ id: 'b', tokens: { total: 300_000, input: 200_000, output: 100_000 } })
    const rows = buildComparison(a, b)
    const totalTokRow = rows.find((r) => r.label === 'Tokens (total)')!
    expect(totalTokRow.winner).toBe('B')
  })

  it('tie when both numeric values are equal', () => {
    const a = makeAgent({ id: 'a', costs: { month: 5.0 } })
    const b = makeAgent({ id: 'b', costs: { month: 5.0 } })
    const rows = buildComparison(a, b)
    const monthRow = rows.find((r) => r.label === 'Cost (month)')!
    expect(monthRow.winner).toBe('tie')
  })

  it('null handling: winner=na when both values are null', () => {
    const a = makeAgent({ id: 'a', costs: undefined })
    const b = makeAgent({ id: 'b', costs: undefined })
    const rows = buildComparison(a, b)
    const monthRow = rows.find((r) => r.label === 'Cost (month)')!
    expect(monthRow.winner).toBe('na')
    expect(monthRow.valueA).toBeNull()
    expect(monthRow.valueB).toBeNull()
  })

  it('null handling: B wins when A value is null and B has value (lower-is-better)', () => {
    const a = makeAgent({ id: 'a', costs: undefined })
    const b = makeAgent({ id: 'b', costs: { month: 2.0 } })
    const rows = buildComparison(a, b)
    const monthRow = rows.find((r) => r.label === 'Cost (month)')!
    expect(monthRow.winner).toBe('B')
  })

  it('null handling: A wins when B value is null and A has value (higher-is-better)', () => {
    const a = makeAgent({ id: 'a', tokens: { total: 100_000 } })
    const b = makeAgent({ id: 'b', tokens: undefined })
    const rows = buildComparison(a, b)
    const totalRow = rows.find((r) => r.label === 'Tokens (total)')!
    expect(totalRow.winner).toBe('A')
  })

  it('carries model info in the info row valueA/valueB', () => {
    const a = makeAgent({ id: 'a', model: 'gpt-4o' })
    const b = makeAgent({ id: 'b', model: 'claude-opus' })
    const rows = buildComparison(a, b)
    const modelRow = rows.find((r) => r.label === 'Model')!
    expect(modelRow.valueA).toBe('gpt-4o')
    expect(modelRow.valueB).toBe('claude-opus')
  })

  it('handles agents with no model or status gracefully', () => {
    const a: CompareAgentLike = { id: 'a' }
    const b: CompareAgentLike = { id: 'b' }
    const rows = buildComparison(a, b)
    expect(rows).toHaveLength(8)
    const modelRow = rows.find((r) => r.label === 'Model')!
    expect(modelRow.valueA).toBeNull()
    expect(modelRow.valueB).toBeNull()
  })
})
