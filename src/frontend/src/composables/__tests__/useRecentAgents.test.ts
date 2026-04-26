import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useRecentAgents } from '../useRecentAgents'

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
  // Reset module-scoped recents via the composable
  const { clear } = useRecentAgents()
  clear()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useRecentAgents', () => {
  it('visit updates reactive recents with the new id at the front', () => {
    const { visit, recents } = useRecentAgents()

    visit('agent-a')
    visit('agent-b')

    expect(recents.value[0]).toBe('agent-b')
    expect(recents.value[1]).toBe('agent-a')
    expect(recents.value).toHaveLength(2)
  })

  it('clear empties reactive recents', () => {
    const { visit, clear, recents } = useRecentAgents()

    visit('agent-x')
    visit('agent-y')
    expect(recents.value).toHaveLength(2)

    clear()
    expect(recents.value).toHaveLength(0)
  })

  it('open and close toggle isOpen', () => {
    const { open, close, isOpen } = useRecentAgents()

    expect(isOpen.value).toBe(false)
    open()
    expect(isOpen.value).toBe(true)
    close()
    expect(isOpen.value).toBe(false)
  })

  it('visit deduplicates and moves existing id to front', () => {
    const { visit, recents } = useRecentAgents()

    visit('a')
    visit('b')
    visit('c')
    // order: c, b, a
    visit('a') // revisit a
    // expected: a, c, b

    expect(recents.value).toEqual(['a', 'c', 'b'])
  })
})
