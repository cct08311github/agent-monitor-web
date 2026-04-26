import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  isValidRange,
  loadRange,
  saveRange,
  weeksToInt,
  cellSizeFor,
} from '../heatmapRange'

// ---------------------------------------------------------------------------
// localStorage stub
// ---------------------------------------------------------------------------

function makeStorage(): Storage {
  const store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key]
    }),
    clear: vi.fn(() => {
      for (const k of Object.keys(store)) delete store[k]
    }),
    get length() {
      return Object.keys(store).length
    },
    key: vi.fn((i: number) => Object.keys(store)[i] ?? null),
  }
}

describe('heatmapRange', () => {
  let storageMock: Storage

  beforeEach(() => {
    storageMock = makeStorage()
    vi.stubGlobal('localStorage', storageMock)
  })

  // -------------------------------------------------------------------------
  // isValidRange
  // -------------------------------------------------------------------------

  describe('isValidRange', () => {
    it('returns true for "7"', () => expect(isValidRange('7')).toBe(true))
    it('returns true for "12"', () => expect(isValidRange('12')).toBe(true))
    it('returns true for "24"', () => expect(isValidRange('24')).toBe(true))
    it('returns false for "5"', () => expect(isValidRange('5')).toBe(false))
    it('returns false for "foo"', () => expect(isValidRange('foo')).toBe(false))
    it('returns false for a number (123)', () => expect(isValidRange(123)).toBe(false))
    it('returns false for null', () => expect(isValidRange(null)).toBe(false))
    it('returns false for undefined', () => expect(isValidRange(undefined)).toBe(false))
  })

  // -------------------------------------------------------------------------
  // loadRange
  // -------------------------------------------------------------------------

  describe('loadRange', () => {
    it('returns "12" when nothing is stored (default)', () => {
      expect(loadRange()).toBe('12')
    })

    it('returns "12" for an invalid stored value', () => {
      storageMock.setItem('oc_heatmap_range', 'bad')
      expect(loadRange()).toBe('12')
    })

    it('returns "12" for a numeric-like stored value "5"', () => {
      storageMock.setItem('oc_heatmap_range', '5')
      expect(loadRange()).toBe('12')
    })

    it('returns "7" after saveRange("7")', () => {
      saveRange('7')
      expect(loadRange()).toBe('7')
    })

    it('returns "24" after saveRange("24")', () => {
      saveRange('24')
      expect(loadRange()).toBe('24')
    })

    it('returns "12" after saveRange("12")', () => {
      saveRange('12')
      expect(loadRange()).toBe('12')
    })
  })

  // -------------------------------------------------------------------------
  // saveRange + round-trip
  // -------------------------------------------------------------------------

  describe('saveRange + loadRange round-trip', () => {
    it('persists "7" and reads it back', () => {
      saveRange('7')
      expect(loadRange()).toBe('7')
    })

    it('overwrites a previous value', () => {
      saveRange('7')
      saveRange('24')
      expect(loadRange()).toBe('24')
    })
  })

  // -------------------------------------------------------------------------
  // weeksToInt
  // -------------------------------------------------------------------------

  describe('weeksToInt', () => {
    it('maps "7" → 7', () => expect(weeksToInt('7')).toBe(7))
    it('maps "12" → 12', () => expect(weeksToInt('12')).toBe(12))
    it('maps "24" → 24', () => expect(weeksToInt('24')).toBe(24))
  })

  // -------------------------------------------------------------------------
  // cellSizeFor
  // -------------------------------------------------------------------------

  describe('cellSizeFor', () => {
    it('maps "7" → 14 (largest cells for fewest weeks)', () => {
      expect(cellSizeFor('7')).toBe(14)
    })
    it('maps "12" → 12', () => expect(cellSizeFor('12')).toBe(12))
    it('maps "24" → 9 (smallest cells for most weeks)', () => {
      expect(cellSizeFor('24')).toBe(9)
    })
  })
})
