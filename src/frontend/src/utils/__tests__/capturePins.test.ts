import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  loadPins,
  savePins,
  togglePin,
  isPinned,
  partition,
} from '../capturePins'

const KEY = 'oc_capture_pinned'

function makeLocalStorageStub(seed: Record<string, string> = {}): Storage {
  const store: Record<string, string> = { ...seed }
  return {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => {
      store[k] = String(v)
    },
    removeItem: (k: string) => {
      delete store[k]
    },
    clear: () => {
      for (const k of Object.keys(store)) delete store[k]
    },
    key: (i: number) => Object.keys(store)[i] ?? null,
    get length() {
      return Object.keys(store).length
    },
  } as Storage
}

describe('capturePins', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeLocalStorageStub())
  })

  it('loadPins returns [] when nothing is stored', () => {
    expect(loadPins()).toEqual([])
  })

  it('loadPins returns [] on corrupt JSON', () => {
    vi.stubGlobal('localStorage', makeLocalStorageStub({ [KEY]: '{not json' }))
    expect(loadPins()).toEqual([])
  })

  it('loadPins returns [] when stored value is not an array', () => {
    vi.stubGlobal('localStorage', makeLocalStorageStub({ [KEY]: JSON.stringify({ id: 'x' }) }))
    expect(loadPins()).toEqual([])
  })

  it('loadPins filters out non-string entries', () => {
    vi.stubGlobal(
      'localStorage',
      makeLocalStorageStub({ [KEY]: JSON.stringify(['id-1', 42, null, 'id-2', true]) }),
    )
    const result = loadPins()
    expect(result).toEqual(['id-1', 'id-2'])
  })

  it('savePins + loadPins round-trip preserves order', () => {
    savePins(['a', 'b', 'c'])
    expect(loadPins()).toEqual(['a', 'b', 'c'])
  })

  it('togglePin adds an id when not pinned', () => {
    const result = togglePin('cap-1')
    expect(result).toContain('cap-1')
    expect(loadPins()).toContain('cap-1')
  })

  it('togglePin removes an id when already pinned', () => {
    togglePin('cap-1')
    const result = togglePin('cap-1')
    expect(result).not.toContain('cap-1')
    expect(loadPins()).not.toContain('cap-1')
  })

  it('isPinned returns true when id is in pins array and false otherwise', () => {
    expect(isPinned(['a', 'b'], 'a')).toBe(true)
    expect(isPinned(['a', 'b'], 'c')).toBe(false)
    expect(isPinned([], 'a')).toBe(false)
  })

  it('partition places pinned items before rest items', () => {
    const items = [
      { id: 'x', body: 'x' },
      { id: 'y', body: 'y' },
      { id: 'z', body: 'z' },
    ]
    const { pinned, rest } = partition(items, ['z'])
    expect(pinned.map((i) => i.id)).toEqual(['z'])
    expect(rest.map((i) => i.id)).toEqual(['x', 'y'])
  })

  it('partition preserves pin order in the pinned list', () => {
    const items = [
      { id: 'a', body: 'a' },
      { id: 'b', body: 'b' },
      { id: 'c', body: 'c' },
    ]
    // pins were added c, then a — pinned order should be c first, then a
    const { pinned } = partition(items, ['c', 'a'])
    expect(pinned.map((i) => i.id)).toEqual(['c', 'a'])
  })

  it('partition with empty pins puts all items in rest', () => {
    const items = [
      { id: 'a', body: 'a' },
      { id: 'b', body: 'b' },
    ]
    const { pinned, rest } = partition(items, [])
    expect(pinned).toHaveLength(0)
    expect(rest).toHaveLength(2)
  })

  it('partition ignores a pin id that is not present in items', () => {
    const items = [{ id: 'a', body: 'a' }]
    const { pinned, rest } = partition(items, ['nonexistent'])
    expect(pinned).toHaveLength(0)
    expect(rest.map((i) => i.id)).toEqual(['a'])
  })
})
