import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { isValidMode, loadViewMode, saveViewMode } from '../captureViewMode'

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

describe('captureViewMode', () => {
  let ctx: ReturnType<typeof mockLocalStorage>

  beforeEach(() => {
    ctx = mockLocalStorage()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ── isValidMode ──────────────────────────────────────────────────────────

  describe('isValidMode', () => {
    it('returns true for "flat"', () => {
      expect(isValidMode('flat')).toBe(true)
    })

    it('returns true for "timeline"', () => {
      expect(isValidMode('timeline')).toBe(true)
    })

    it('returns false for an arbitrary string', () => {
      expect(isValidMode('foo')).toBe(false)
    })

    it('returns false for null', () => {
      expect(isValidMode(null)).toBe(false)
    })

    it('returns false for undefined', () => {
      expect(isValidMode(undefined)).toBe(false)
    })

    it('returns false for a number', () => {
      expect(isValidMode(42)).toBe(false)
    })

    it('returns false for empty string', () => {
      expect(isValidMode('')).toBe(false)
    })
  })

  // ── loadViewMode — defaults ───────────────────────────────────────────────

  describe('loadViewMode — default', () => {
    it('returns "flat" when localStorage is empty', () => {
      expect(loadViewMode()).toBe('flat')
    })

    it('returns "flat" for an invalid stored value', () => {
      ctx.store['oc_capture_view_mode'] = 'invalid-mode'
      expect(loadViewMode()).toBe('flat')
    })

    it('returns "flat" for an empty string stored', () => {
      ctx.store['oc_capture_view_mode'] = ''
      expect(loadViewMode()).toBe('flat')
    })
  })

  // ── loadViewMode — valid stored values ────────────────────────────────────

  describe('loadViewMode — valid stored values', () => {
    it('returns "flat" when "flat" is stored', () => {
      ctx.store['oc_capture_view_mode'] = 'flat'
      expect(loadViewMode()).toBe('flat')
    })

    it('returns "timeline" when "timeline" is stored', () => {
      ctx.store['oc_capture_view_mode'] = 'timeline'
      expect(loadViewMode()).toBe('timeline')
    })
  })

  // ── loadViewMode — exception path ─────────────────────────────────────────

  describe('loadViewMode — localStorage exception', () => {
    it('returns "flat" when localStorage.getItem throws', () => {
      ctx.throwOnAccess = true
      expect(loadViewMode()).toBe('flat')
    })
  })

  // ── saveViewMode + loadViewMode round-trip ────────────────────────────────

  describe('saveViewMode + loadViewMode round-trip', () => {
    it('persists "flat" and reads it back', () => {
      saveViewMode('flat')
      expect(loadViewMode()).toBe('flat')
    })

    it('persists "timeline" and reads it back', () => {
      saveViewMode('timeline')
      expect(loadViewMode()).toBe('timeline')
    })

    it('overwrites a previous value on subsequent saves', () => {
      saveViewMode('timeline')
      saveViewMode('flat')
      expect(loadViewMode()).toBe('flat')
    })
  })

  // ── saveViewMode — exception path ─────────────────────────────────────────

  describe('saveViewMode — localStorage exception', () => {
    it('does not throw when localStorage.setItem throws', () => {
      ctx.throwOnAccess = true
      expect(() => saveViewMode('timeline')).not.toThrow()
    })
  })
})
