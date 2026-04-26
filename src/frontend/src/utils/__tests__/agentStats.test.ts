import { describe, it, expect } from 'vitest'
import { captureMatchesAgent, computeAgentStats } from '../agentStats'
import type { Capture } from '../quickCapture'

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function makeCapture(id: string, context: string): Capture {
  return { id, body: 'test', context, createdAt: Date.now() }
}

// ---------------------------------------------------------------------------
// captureMatchesAgent
// ---------------------------------------------------------------------------

describe('captureMatchesAgent', () => {
  it('matches when context contains agentId as substring', () => {
    const c = makeCapture('c1', 'AgentDetail: abc-123')
    expect(captureMatchesAgent(c, 'abc-123', '')).toBe(true)
  })

  it('matches when context contains displayName as substring', () => {
    const c = makeCapture('c2', 'AgentDetail: My Bot')
    expect(captureMatchesAgent(c, 'some-other-id', 'My Bot')).toBe(true)
  })

  it('returns false when neither agentId nor displayName appears in context', () => {
    const c = makeCapture('c3', 'AgentDetail: totally-different')
    expect(captureMatchesAgent(c, 'abc-123', 'My Bot')).toBe(false)
  })

  it('handles empty displayName without false-positive', () => {
    const c = makeCapture('c4', 'AgentDetail: abc-123')
    expect(captureMatchesAgent(c, 'abc-123', '')).toBe(true)
  })

  it('handles empty agentId without false-positive', () => {
    const c = makeCapture('c5', 'some context')
    expect(captureMatchesAgent(c, '', 'My Bot')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// computeAgentStats
// ---------------------------------------------------------------------------

describe('computeAgentStats', () => {
  it('returns 0/0/0/0 for completely empty input', () => {
    const stats = computeAgentStats({
      agentId: 'agent-1',
      displayName: 'Agent One',
      bookmarks: [],
      captures: [],
      pinnedIds: [],
      notesText: '',
    })
    expect(stats).toEqual({ bookmarks: 0, captures: 0, pinnedCaptures: 0, notesChars: 0 })
  })

  it('counts bookmarks correctly', () => {
    const stats = computeAgentStats({
      agentId: 'agent-1',
      displayName: '',
      bookmarks: ['s1', 's2', 's3'],
      captures: [],
      pinnedIds: [],
      notesText: '',
    })
    expect(stats.bookmarks).toBe(3)
  })

  it('counts only captures that match the agent context', () => {
    const captures: Capture[] = [
      makeCapture('c1', 'AgentDetail: agent-1'),
      makeCapture('c2', 'AgentDetail: agent-1'),
      makeCapture('c3', 'AgentDetail: agent-2'),
    ]
    const stats = computeAgentStats({
      agentId: 'agent-1',
      displayName: '',
      bookmarks: [],
      captures,
      pinnedIds: [],
      notesText: '',
    })
    expect(stats.captures).toBe(2)
  })

  it('counts pinned captures only when they intersect with matched captures', () => {
    const captures: Capture[] = [
      makeCapture('c1', 'AgentDetail: agent-1'), // matches + pinned
      makeCapture('c2', 'AgentDetail: agent-1'), // matches, not pinned
      makeCapture('c3', 'AgentDetail: agent-2'), // does NOT match, but pinned
    ]
    const stats = computeAgentStats({
      agentId: 'agent-1',
      displayName: '',
      bookmarks: [],
      captures,
      pinnedIds: ['c1', 'c3'], // c3 is pinned but not matched
      notesText: '',
    })
    expect(stats.captures).toBe(2)
    expect(stats.pinnedCaptures).toBe(1) // only c1
  })

  it('counts notes chars after trimming whitespace', () => {
    const stats = computeAgentStats({
      agentId: 'agent-1',
      displayName: '',
      bookmarks: [],
      captures: [],
      pinnedIds: [],
      notesText: '  hello world  ',
    })
    expect(stats.notesChars).toBe(11) // "hello world"
  })

  it('returns notesChars 0 for whitespace-only note', () => {
    const stats = computeAgentStats({
      agentId: 'agent-1',
      displayName: '',
      bookmarks: [],
      captures: [],
      pinnedIds: [],
      notesText: '   \n\t  ',
    })
    expect(stats.notesChars).toBe(0)
  })

  it('combines all metrics correctly for a realistic scenario', () => {
    const captures: Capture[] = [
      makeCapture('c1', 'AgentDetail: My Agent'),
      makeCapture('c2', 'AgentDetail: My Agent'),
      makeCapture('c3', 'AgentDetail: My Agent'),
      makeCapture('c4', 'other-context'),
    ]
    const stats = computeAgentStats({
      agentId: 'agent-xyz',
      displayName: 'My Agent',
      bookmarks: ['s1', 's2'],
      captures,
      pinnedIds: ['c1', 'c2'],
      notesText: 'some notes here',
    })
    expect(stats.bookmarks).toBe(2)
    expect(stats.captures).toBe(3)
    expect(stats.pinnedCaptures).toBe(2)
    expect(stats.notesChars).toBe(15)
  })
})
