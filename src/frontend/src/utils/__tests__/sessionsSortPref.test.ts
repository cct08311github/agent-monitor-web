import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { isValidOrder, loadSessionsSortOrder, saveSessionsSortOrder } from '../sessionsSortPref'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockLocalStorage(): { store: Record<string, string>; throwOnAccess: boolean } {
  const ctx = { store: {} as Record<string, string>, throwOnAccess: false }

  const getItem = vi.fn((key: string) => {
    if (ctx.throwOnAccess) throw new Error('localStorage unavailable')
    return Object.prototype.hasOwnProperty.call(ctx.store, key) ? ctx.store[key] : null
  })

  const setItem = vi.fn((key: string, value: string) => {
    if (ctx.throwOnAccess) throw new Error('localStorage unavailable')
    ctx.store[key] = value
  })

  const removeItem = vi.fn((key: string) => {
    delete ctx.store[key]
  })

  const clear = vi.fn(() => {
    ctx.store = {}
  })

  Object.defineProperty(globalThis, 'localStorage', {
    value: { getItem, setItem, removeItem, clear },
    writable: true,
    configurable: true,
  })

  return ctx
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('sessionsSortPref', () => {
  let ctx: ReturnType<typeof mockLocalStorage>

  beforeEach(() => {
    ctx = mockLocalStorage()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ── isValidOrder ──────────────────────────────────────────────────────────

  describe('isValidOrder', () => {
    it('returns true for "desc"', () => {
      expect(isValidOrder('desc')).toBe(true)
    })

    it('returns true for "asc"', () => {
      expect(isValidOrder('asc')).toBe(true)
    })

    it('returns false for unknown string "foo"', () => {
      expect(isValidOrder('foo')).toBe(false)
    })

    it('returns false for numeric 123', () => {
      expect(isValidOrder(123)).toBe(false)
    })

    it('returns false for null', () => {
      expect(isValidOrder(null)).toBe(false)
    })

    it('returns false for undefined', () => {
      expect(isValidOrder(undefined)).toBe(false)
    })

    it('returns false for empty string', () => {
      expect(isValidOrder('')).toBe(false)
    })
  })

  // ── loadSessionsSortOrder — defaults ─────────────────────────────────────

  describe('loadSessionsSortOrder — default', () => {
    it('returns "desc" when localStorage is empty', () => {
      expect(loadSessionsSortOrder()).toBe('desc')
    })

    it('returns "desc" for an invalid stored value', () => {
      ctx.store['oc_sessions_sort_order'] = 'invalid'
      expect(loadSessionsSortOrder()).toBe('desc')
    })

    it('returns "desc" for a numeric-string stored value', () => {
      ctx.store['oc_sessions_sort_order'] = '42'
      expect(loadSessionsSortOrder()).toBe('desc')
    })
  })

  // ── loadSessionsSortOrder — valid stored values ───────────────────────────

  describe('loadSessionsSortOrder — valid stored values', () => {
    it('returns "asc" when "asc" is stored', () => {
      ctx.store['oc_sessions_sort_order'] = 'asc'
      expect(loadSessionsSortOrder()).toBe('asc')
    })

    it('returns "desc" when "desc" is stored', () => {
      ctx.store['oc_sessions_sort_order'] = 'desc'
      expect(loadSessionsSortOrder()).toBe('desc')
    })
  })

  // ── loadSessionsSortOrder — exception path ────────────────────────────────

  describe('loadSessionsSortOrder — localStorage exception', () => {
    it('returns "desc" when localStorage.getItem throws', () => {
      ctx.throwOnAccess = true
      expect(loadSessionsSortOrder()).toBe('desc')
    })
  })

  // ── saveSessionsSortOrder + loadSessionsSortOrder round-trip ──────────────

  describe('saveSessionsSortOrder + loadSessionsSortOrder round-trip', () => {
    it('persists "asc" and reads it back', () => {
      saveSessionsSortOrder('asc')
      expect(loadSessionsSortOrder()).toBe('asc')
    })

    it('persists "desc" and reads it back', () => {
      saveSessionsSortOrder('asc')
      saveSessionsSortOrder('desc')
      expect(loadSessionsSortOrder()).toBe('desc')
    })
  })

  // ── saveSessionsSortOrder — exception path ────────────────────────────────

  describe('saveSessionsSortOrder — localStorage exception', () => {
    it('does not throw when localStorage.setItem throws', () => {
      ctx.throwOnAccess = true
      expect(() => saveSessionsSortOrder('asc')).not.toThrow()
    })
  })
})
