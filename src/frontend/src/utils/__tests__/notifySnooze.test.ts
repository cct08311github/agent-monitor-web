import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  loadSnoozedUntil,
  setSnoozedUntil,
  isSnoozedNow,
  snoozeFor,
  clearSnooze,
  SNOOZE_OPTIONS,
  formatRemainingMs,
} from '../notifySnooze'

// ---------------------------------------------------------------------------
// localStorage stub
// ---------------------------------------------------------------------------

let store: Record<string, string> = {}

const localStorageMock: Storage = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => {
    store[key] = value
  },
  removeItem: (key: string) => {
    delete store[key]
  },
  clear: () => {
    store = {}
  },
  get length() {
    return Object.keys(store).length
  },
  key: (index: number) => Object.keys(store)[index] ?? null,
}

const LS_KEY = 'oc_notify_snoozed_until'

beforeEach(() => {
  store = {}
  Object.defineProperty(globalThis, 'localStorage', {
    value: localStorageMock,
    writable: true,
    configurable: true,
  })
})

afterEach(() => {
  store = {}
})

// ---------------------------------------------------------------------------
// loadSnoozedUntil
// ---------------------------------------------------------------------------

describe('loadSnoozedUntil', () => {
  it('returns null when nothing is stored', () => {
    expect(loadSnoozedUntil()).toBeNull()
  })

  it('returns the stored number after setSnoozedUntil', () => {
    setSnoozedUntil(123456)
    expect(loadSnoozedUntil()).toBe(123456)
  })

  it('returns null after setSnoozedUntil(null)', () => {
    setSnoozedUntil(999)
    setSnoozedUntil(null)
    expect(loadSnoozedUntil()).toBeNull()
  })

  it('returns null for corrupt stored value ("abc")', () => {
    store[LS_KEY] = 'abc'
    expect(loadSnoozedUntil()).toBeNull()
  })

  it('returns null for empty string (falsy guard fires before Number parse)', () => {
    store[LS_KEY] = ''
    // loadSnoozedUntil does `if (!raw) return null`; empty string is falsy → null
    expect(loadSnoozedUntil()).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// setSnoozedUntil
// ---------------------------------------------------------------------------

describe('setSnoozedUntil', () => {
  it('stores the value as a string', () => {
    setSnoozedUntil(500)
    expect(store[LS_KEY]).toBe('500')
  })

  it('removes the key when called with null', () => {
    store[LS_KEY] = '500'
    setSnoozedUntil(null)
    expect(LS_KEY in store).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// isSnoozedNow
// ---------------------------------------------------------------------------

describe('isSnoozedNow', () => {
  it('returns false when nothing stored', () => {
    expect(isSnoozedNow(Date.now())).toBe(false)
  })

  it('returns true when snoozedUntil is strictly in the future', () => {
    const now = 1_000_000
    setSnoozedUntil(now + 1)
    expect(isSnoozedNow(now)).toBe(true)
  })

  it('returns false when snoozedUntil equals now (boundary)', () => {
    const now = 1_000_000
    setSnoozedUntil(now)
    expect(isSnoozedNow(now)).toBe(false)
  })

  it('returns false when snoozedUntil is in the past', () => {
    const now = 1_000_000
    setSnoozedUntil(now - 1)
    expect(isSnoozedNow(now)).toBe(false)
  })

  it('returns false when stored value is 0 (≤ any real now)', () => {
    store[LS_KEY] = '0'
    expect(isSnoozedNow(Date.now())).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// snoozeFor
// ---------------------------------------------------------------------------

describe('snoozeFor', () => {
  it('writes future timestamp and returns expiresAt', () => {
    const now = 2_000_000
    const dur = 60 * 60 * 1000 // 1h
    const expiresAt = snoozeFor(dur, now)
    expect(expiresAt).toBe(now + dur)
    expect(loadSnoozedUntil()).toBe(now + dur)
  })

  it('15m snooze produces the correct expiry', () => {
    const now = 0
    const expiresAt = snoozeFor(15 * 60 * 1000, now)
    expect(expiresAt).toBe(15 * 60 * 1000)
    expect(isSnoozedNow(now)).toBe(true)
    expect(isSnoozedNow(now + 15 * 60 * 1000)).toBe(false) // exactly at expiry
  })

  it('4h snooze shows as active before expiry', () => {
    const now = 1_000_000
    snoozeFor(4 * 60 * 60 * 1000, now)
    expect(isSnoozedNow(now + 1)).toBe(true)
    expect(isSnoozedNow(now + 4 * 60 * 60 * 1000)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// clearSnooze
// ---------------------------------------------------------------------------

describe('clearSnooze', () => {
  it('removes the key from localStorage', () => {
    setSnoozedUntil(9_999_999)
    clearSnooze()
    expect(loadSnoozedUntil()).toBeNull()
    expect(LS_KEY in store).toBe(false)
  })

  it('is a no-op when nothing is stored', () => {
    expect(() => clearSnooze()).not.toThrow()
    expect(loadSnoozedUntil()).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// SNOOZE_OPTIONS
// ---------------------------------------------------------------------------

describe('SNOOZE_OPTIONS', () => {
  it('has exactly 3 options: 15m, 1h, 4h', () => {
    expect(SNOOZE_OPTIONS).toHaveLength(3)
    const labels = SNOOZE_OPTIONS.map((o) => o.label)
    expect(labels).toContain('15 分鐘')
    expect(labels).toContain('1 小時')
    expect(labels).toContain('4 小時')
  })

  it('ms values are correct', () => {
    expect(SNOOZE_OPTIONS[0].ms).toBe(15 * 60 * 1000)
    expect(SNOOZE_OPTIONS[1].ms).toBe(60 * 60 * 1000)
    expect(SNOOZE_OPTIONS[2].ms).toBe(4 * 60 * 60 * 1000)
  })
})

// ---------------------------------------------------------------------------
// formatRemainingMs
// ---------------------------------------------------------------------------

describe('formatRemainingMs', () => {
  it('formats sub-60m as minutes', () => {
    expect(formatRemainingMs(23 * 60 * 1000)).toBe('23m')
    expect(formatRemainingMs(59 * 60 * 1000 + 59_000)).toBe('59m')
  })

  it('formats 60m+ as hours', () => {
    expect(formatRemainingMs(60 * 60 * 1000)).toBe('1h')
    expect(formatRemainingMs(4 * 60 * 60 * 1000)).toBe('4h')
  })

  it('clamps negative values to 0m', () => {
    expect(formatRemainingMs(-5000)).toBe('0m')
  })

  it('formats 0ms as 0m', () => {
    expect(formatRemainingMs(0)).toBe('0m')
  })
})
