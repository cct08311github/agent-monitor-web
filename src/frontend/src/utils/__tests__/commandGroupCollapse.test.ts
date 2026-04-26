import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  loadCollapsed,
  saveCollapsed,
  toggleCollapsed,
  isCollapsed,
} from '../commandGroupCollapse'

// ---------------------------------------------------------------------------
// Mock localStorage
// ---------------------------------------------------------------------------

const _store: Record<string, string> = {}

const localStorageMock = {
  getItem: vi.fn((key: string): string | null => _store[key] ?? null),
  setItem: vi.fn((key: string, value: string): void => {
    _store[key] = value
  }),
  removeItem: vi.fn((key: string): void => {
    delete _store[key]
  }),
  clear: vi.fn((): void => {
    for (const key of Object.keys(_store)) {
      delete _store[key]
    }
  }),
}

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
})

const KEY = 'oc_cmd_collapsed_groups'

describe('commandGroupCollapse', () => {
  beforeEach(() => {
    localStorageMock.clear()
    vi.clearAllMocks()
    // Re-bind mocks after clearAllMocks
    localStorageMock.getItem.mockImplementation((k: string) => _store[k] ?? null)
    localStorageMock.setItem.mockImplementation((k: string, v: string) => {
      _store[k] = v
    })
    localStorageMock.clear.mockImplementation(() => {
      for (const k of Object.keys(_store)) delete _store[k]
    })
  })

  // -------------------------------------------------------------------------
  // loadCollapsed
  // -------------------------------------------------------------------------

  it('loadCollapsed returns empty Set when nothing stored', () => {
    const result = loadCollapsed()
    expect(result).toBeInstanceOf(Set)
    expect(result.size).toBe(0)
  })

  it('loadCollapsed returns empty Set on corrupt JSON', () => {
    _store[KEY] = 'not-valid-json{'
    const result = loadCollapsed()
    expect(result).toBeInstanceOf(Set)
    expect(result.size).toBe(0)
  })

  it('loadCollapsed returns empty Set when stored value is not an array', () => {
    _store[KEY] = JSON.stringify({ foo: 'bar' })
    const result = loadCollapsed()
    expect(result).toBeInstanceOf(Set)
    expect(result.size).toBe(0)
  })

  it('loadCollapsed filters out non-string entries', () => {
    _store[KEY] = JSON.stringify(['Navigation', 42, null, 'Actions', true])
    const result = loadCollapsed()
    expect(result.size).toBe(2)
    expect(result.has('Navigation')).toBe(true)
    expect(result.has('Actions')).toBe(true)
  })

  // -------------------------------------------------------------------------
  // saveCollapsed + loadCollapsed round-trip
  // -------------------------------------------------------------------------

  it('saveCollapsed + loadCollapsed round-trip preserves Set contents', () => {
    const original = new Set(['Navigation', 'Shortcut'])
    saveCollapsed(original)
    const restored = loadCollapsed()
    expect(restored.size).toBe(2)
    expect(restored.has('Navigation')).toBe(true)
    expect(restored.has('Shortcut')).toBe(true)
  })

  it('saveCollapsed with empty Set → loadCollapsed returns empty Set', () => {
    saveCollapsed(new Set())
    const restored = loadCollapsed()
    expect(restored.size).toBe(0)
  })

  // -------------------------------------------------------------------------
  // toggleCollapsed
  // -------------------------------------------------------------------------

  it('toggleCollapsed adds category when not present', () => {
    const original = new Set<string>(['Actions'])
    const next = toggleCollapsed(original, 'Navigation')
    expect(next.has('Navigation')).toBe(true)
    expect(next.has('Actions')).toBe(true)
  })

  it('toggleCollapsed removes category when already present', () => {
    const original = new Set<string>(['Navigation', 'Actions'])
    const next = toggleCollapsed(original, 'Navigation')
    expect(next.has('Navigation')).toBe(false)
    expect(next.has('Actions')).toBe(true)
  })

  it('toggleCollapsed does not mutate the input Set', () => {
    const original = new Set<string>(['Navigation'])
    const next = toggleCollapsed(original, 'Navigation')
    // original should remain unchanged
    expect(original.has('Navigation')).toBe(true)
    // next is a different Set object
    expect(next).not.toBe(original)
  })

  it('toggleCollapsed returns a new Set instance', () => {
    const original = new Set<string>()
    const next = toggleCollapsed(original, 'Actions')
    expect(next).toBeInstanceOf(Set)
    expect(next).not.toBe(original)
  })

  // -------------------------------------------------------------------------
  // isCollapsed
  // -------------------------------------------------------------------------

  it('isCollapsed returns true for a collapsed category', () => {
    const set = new Set(['Navigation'])
    expect(isCollapsed(set, 'Navigation')).toBe(true)
  })

  it('isCollapsed returns false for a non-collapsed category', () => {
    const set = new Set(['Actions'])
    expect(isCollapsed(set, 'Navigation')).toBe(false)
  })

  it('isCollapsed returns false on empty Set', () => {
    const set = new Set<string>()
    expect(isCollapsed(set, 'Navigation')).toBe(false)
  })
})
