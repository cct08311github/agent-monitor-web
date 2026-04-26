import { describe, it, expect } from 'vitest'
import { filterAgentsByQuery, type SearchableAgent } from '../agentSearchFilter'

interface TestAgent extends SearchableAgent {
  label?: string
}

const agents: TestAgent[] = [
  { id: 'claude-main', name: 'Main Claude Agent' },
  { id: 'gpt-worker', name: 'GPT Worker' },
  { id: 'gemini-runner', name: 'Gemini Task Runner' },
  { id: 'local-dev', name: null },
]

function identity(a: TestAgent): string {
  return a.name ?? a.id
}

describe('filterAgentsByQuery', () => {
  it('empty query returns all agents (unfiltered copy)', () => {
    const result = filterAgentsByQuery(agents, '', identity)
    expect(result).toHaveLength(agents.length)
    expect(result.map((a) => a.id)).toEqual(agents.map((a) => a.id))
  })

  it('whitespace-only query returns all agents', () => {
    const result = filterAgentsByQuery(agents, '   ', identity)
    expect(result).toHaveLength(agents.length)
  })

  it('filters by id substring (fuzzy match on id)', () => {
    const result = filterAgentsByQuery(agents, 'claude', identity)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('claude-main')
  })

  it('filters by displayName substring', () => {
    const result = filterAgentsByQuery(agents, 'Runner', identity)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('gemini-runner')
  })

  it('is case-insensitive (uppercase query matches lowercase id/name)', () => {
    const result = filterAgentsByQuery(agents, 'CLAUDE', identity)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('claude-main')
  })

  it('query that matches nothing returns empty array', () => {
    const result = filterAgentsByQuery(agents, 'zzzzxxx', identity)
    expect(result).toHaveLength(0)
  })

  it('alias match via getDisplayName: aliased agent matches by alias even if id differs', () => {
    const withAlias: TestAgent[] = [
      { id: 'agent-xyz', name: 'Raw Name' },
      { id: 'other-agent', name: 'Other' },
    ]
    // getDisplayName returns the alias "MyFriendlyAlias" for agent-xyz
    const getDisplayName = (a: TestAgent) =>
      a.id === 'agent-xyz' ? 'MyFriendlyAlias' : (a.name ?? a.id)

    const result = filterAgentsByQuery(withAlias, 'Friendly', getDisplayName)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('agent-xyz')
  })

  it('agent with null name still matches via id fuzzy match', () => {
    // local-dev has name: null; identity fn falls back to id
    const result = filterAgentsByQuery(agents, 'local', identity)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('local-dev')
  })

  it('does not mutate the original array', () => {
    const original = [...agents]
    filterAgentsByQuery(agents, 'claude', identity)
    expect(agents).toEqual(original)
  })

  it('partial fuzzy match on id (not exact substring) still passes', () => {
    // 'gmni' fuzzy matches 'gemini-runner'
    const result = filterAgentsByQuery(agents, 'gmni', identity)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('gemini-runner')
  })
})
