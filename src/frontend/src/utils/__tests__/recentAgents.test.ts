import { describe, it, expect, beforeEach, vi } from 'vitest'
import { loadRecents, recordVisit, clearRecents } from '../recentAgents'

// ---------------------------------------------------------------------------
// localStorage stub
// ---------------------------------------------------------------------------

function makeLocalStorageStub() {
  const store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      Object.keys(store).forEach((k) => delete store[k])
    },
    get length() {
      return Object.keys(store).length
    },
    key: (index: number) => Object.keys(store)[index] ?? null,
  }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', makeLocalStorageStub())
})

// ---------------------------------------------------------------------------
// loadRecents
// ---------------------------------------------------------------------------

describe('loadRecents', () => {
  it('returns [] when nothing is stored', () => {
    expect(loadRecents()).toEqual([])
  })

  it('returns [] on corrupt JSON', () => {
    localStorage.setItem('oc_recent_agents', 'not-json{{{')
    expect(loadRecents()).toEqual([])
  })

  it('filters out non-string entries', () => {
    localStorage.setItem('oc_recent_agents', JSON.stringify(['valid-id', 42, null, 'another-id']))
    expect(loadRecents()).toEqual(['valid-id', 'another-id'])
  })
})

// ---------------------------------------------------------------------------
// recordVisit
// ---------------------------------------------------------------------------

describe('recordVisit', () => {
  it('recordVisit("a") returns ["a"]', () => {
    expect(recordVisit('a')).toEqual(['a'])
  })

  it('recordVisit("a") then recordVisit("b") returns ["b", "a"]', () => {
    recordVisit('a')
    expect(recordVisit('b')).toEqual(['b', 'a'])
  })

  it('deduplicates: recordVisit("a") twice still returns ["a"]', () => {
    recordVisit('a')
    expect(recordVisit('a')).toEqual(['a'])
  })

  it('11th unique visit drops oldest — result length stays at 10', () => {
    for (let i = 1; i <= 11; i++) {
      recordVisit(`agent-${i}`)
    }
    const result = loadRecents()
    expect(result).toHaveLength(10)
    // agent-1 was the first inserted and should have been dropped
    expect(result).not.toContain('agent-1')
    // agent-11 was the most recent
    expect(result[0]).toBe('agent-11')
  })

  it('re-visiting an existing agent moves it to the front', () => {
    recordVisit('b')
    recordVisit('a')
    recordVisit('c')
    // order now: c, a, b
    recordVisit('a') // revisit a
    // expected: a, c, b
    expect(loadRecents()).toEqual(['a', 'c', 'b'])
  })

  it('persists across separate loadRecents calls', () => {
    recordVisit('x')
    recordVisit('y')
    const loaded = loadRecents()
    expect(loaded[0]).toBe('y')
    expect(loaded[1]).toBe('x')
  })
})

// ---------------------------------------------------------------------------
// clearRecents
// ---------------------------------------------------------------------------

describe('clearRecents', () => {
  it('clearRecents empties all recents', () => {
    recordVisit('agent-1')
    recordVisit('agent-2')
    clearRecents()
    expect(loadRecents()).toEqual([])
  })
})
