import { describe, it, expect } from 'vitest'
import { uniqueContexts, filterByContext } from '../captureContextFilter'
import type { Capture } from '../quickCapture'

function makeCapture(id: string, context: string, body = 'test'): Capture {
  return { id, body, context, createdAt: Date.now() }
}

const sampleCaptures: Capture[] = [
  makeCapture('1', 'LogsTab'),
  makeCapture('2', 'AgentDetail: 客服機器人'),
  makeCapture('3', 'LogsTab'),
  makeCapture('4', 'ChatTab'),
  makeCapture('5', ''),
  makeCapture('6', '   '),
]

describe('uniqueContexts', () => {
  it('returns sorted unique non-empty contexts', () => {
    const result = uniqueContexts(sampleCaptures)
    expect(result).toEqual(['AgentDetail: 客服機器人', 'ChatTab', 'LogsTab'])
  })

  it('returns empty array for empty input', () => {
    expect(uniqueContexts([])).toEqual([])
  })

  it('filters out empty and whitespace-only contexts', () => {
    const captures: Capture[] = [
      makeCapture('1', ''),
      makeCapture('2', '   '),
      makeCapture('3', '\t'),
    ]
    expect(uniqueContexts(captures)).toEqual([])
  })

  it('deduplicates contexts that appear multiple times', () => {
    const captures: Capture[] = [
      makeCapture('1', 'LogsTab'),
      makeCapture('2', 'LogsTab'),
      makeCapture('3', 'LogsTab'),
    ]
    expect(uniqueContexts(captures)).toEqual(['LogsTab'])
  })

  it('sorts contexts alphabetically', () => {
    const captures: Capture[] = [
      makeCapture('1', 'ZContext'),
      makeCapture('2', 'AContext'),
      makeCapture('3', 'MContext'),
    ]
    expect(uniqueContexts(captures)).toEqual(['AContext', 'MContext', 'ZContext'])
  })
})

describe('filterByContext', () => {
  it('returns all captures when context is null', () => {
    const result = filterByContext(sampleCaptures, null)
    expect(result).toHaveLength(sampleCaptures.length)
    expect(result).toEqual([...sampleCaptures])
  })

  it('returns only captures matching the given context', () => {
    const result = filterByContext(sampleCaptures, 'LogsTab')
    expect(result).toHaveLength(2)
    expect(result.every((c) => c.context === 'LogsTab')).toBe(true)
  })

  it('returns empty array when no captures match the context', () => {
    const result = filterByContext(sampleCaptures, 'NonExistent')
    expect(result).toEqual([])
  })

  it('returns an empty array for empty input regardless of context', () => {
    expect(filterByContext([], 'LogsTab')).toEqual([])
    expect(filterByContext([], null)).toEqual([])
  })

  it('does not mutate the original array', () => {
    const original = [...sampleCaptures]
    filterByContext(sampleCaptures, 'LogsTab')
    expect(sampleCaptures).toEqual(original)
  })
})
