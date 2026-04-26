import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  parseHM,
  minutesOf,
  isInQuietHours,
  loadConfig,
  saveConfig,
  DEFAULT_CONFIG,
  type QuietHoursConfig,
} from '../quietHours'

// ---------------------------------------------------------------------------
// localStorage stub (happy-dom does not expose .clear())
// ---------------------------------------------------------------------------

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

const LS_KEY = 'oc_quiet_hours'

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function mockDate(iso: string): Date {
  return new Date(iso)
}

// ---------------------------------------------------------------------------
// parseHM
// ---------------------------------------------------------------------------

describe('parseHM', () => {
  it('parses a zero-padded time correctly', () => {
    expect(parseHM('09:30')).toEqual({ h: 9, m: 30 })
  })

  it('parses midnight as 00:00', () => {
    expect(parseHM('00:00')).toEqual({ h: 0, m: 0 })
  })

  it('parses the latest valid time 23:59', () => {
    expect(parseHM('23:59')).toEqual({ h: 23, m: 59 })
  })

  it('parses a non-zero-padded hour', () => {
    expect(parseHM('7:05')).toEqual({ h: 7, m: 5 })
  })

  it('returns null for hours > 23', () => {
    expect(parseHM('25:00')).toBeNull()
  })

  it('returns null for minutes >= 60', () => {
    expect(parseHM('12:60')).toBeNull()
  })

  it('returns null for non-numeric strings', () => {
    expect(parseHM('abc')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parseHM('')).toBeNull()
  })

  it('returns null for partial time "09"', () => {
    expect(parseHM('09')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// minutesOf
// ---------------------------------------------------------------------------

describe('minutesOf', () => {
  it('converts 09:30 to 570', () => {
    expect(minutesOf('09:30')).toBe(570)
  })

  it('converts 00:00 to 0', () => {
    expect(minutesOf('00:00')).toBe(0)
  })

  it('converts 23:59 to 1439', () => {
    expect(minutesOf('23:59')).toBe(1439)
  })

  it('returns NaN for invalid string', () => {
    expect(minutesOf('abc')).toBeNaN()
  })
})

// ---------------------------------------------------------------------------
// isInQuietHours — same-day window
// ---------------------------------------------------------------------------

describe('isInQuietHours — same-day window (09:00-17:00)', () => {
  const config: QuietHoursConfig = { enabled: true, start: '09:00', end: '17:00' }

  it('returns true when current time is within the window (12:00)', () => {
    expect(isInQuietHours(config, mockDate('2026-04-26T12:00:00'))).toBe(true)
  })

  it('returns true at the start boundary (09:00)', () => {
    expect(isInQuietHours(config, mockDate('2026-04-26T09:00:00'))).toBe(true)
  })

  it('returns false just before the start boundary (08:59)', () => {
    expect(isInQuietHours(config, mockDate('2026-04-26T08:59:00'))).toBe(false)
  })

  it('returns false at the end boundary (17:00)', () => {
    expect(isInQuietHours(config, mockDate('2026-04-26T17:00:00'))).toBe(false)
  })

  it('returns false after the window (20:00)', () => {
    expect(isInQuietHours(config, mockDate('2026-04-26T20:00:00'))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// isInQuietHours — overnight window
// ---------------------------------------------------------------------------

describe('isInQuietHours — overnight window (22:00-07:00)', () => {
  const config: QuietHoursConfig = { enabled: true, start: '22:00', end: '07:00' }

  it('returns true at 23:00 (evening, pre-midnight)', () => {
    expect(isInQuietHours(config, mockDate('2026-04-26T23:00:00'))).toBe(true)
  })

  it('returns true at 03:00 (post-midnight)', () => {
    expect(isInQuietHours(config, mockDate('2026-04-26T03:00:00'))).toBe(true)
  })

  it('returns false at 12:00 (daytime)', () => {
    expect(isInQuietHours(config, mockDate('2026-04-26T12:00:00'))).toBe(false)
  })

  it('returns false at the end boundary (07:00)', () => {
    expect(isInQuietHours(config, mockDate('2026-04-26T07:00:00'))).toBe(false)
  })

  it('returns true at the start boundary (22:00)', () => {
    expect(isInQuietHours(config, mockDate('2026-04-26T22:00:00'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// isInQuietHours — edge cases
// ---------------------------------------------------------------------------

describe('isInQuietHours — edge cases', () => {
  it('returns false when start === end (zero-length window)', () => {
    const config: QuietHoursConfig = { enabled: true, start: '10:00', end: '10:00' }
    expect(isInQuietHours(config, mockDate('2026-04-26T10:00:00'))).toBe(false)
    expect(isInQuietHours(config, mockDate('2026-04-26T10:01:00'))).toBe(false)
    expect(isInQuietHours(config, mockDate('2026-04-26T09:59:00'))).toBe(false)
  })

  it('always returns false when enabled is false', () => {
    const config: QuietHoursConfig = { enabled: false, start: '22:00', end: '07:00' }
    expect(isInQuietHours(config, mockDate('2026-04-26T23:00:00'))).toBe(false)
    expect(isInQuietHours(config, mockDate('2026-04-26T02:00:00'))).toBe(false)
  })

  it('returns false for invalid start time', () => {
    const config: QuietHoursConfig = { enabled: true, start: 'bad', end: '07:00' }
    expect(isInQuietHours(config, mockDate('2026-04-26T12:00:00'))).toBe(false)
  })

  it('returns false for invalid end time', () => {
    const config: QuietHoursConfig = { enabled: true, start: '22:00', end: 'bad' }
    expect(isInQuietHours(config, mockDate('2026-04-26T23:00:00'))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// loadConfig / saveConfig
// ---------------------------------------------------------------------------

describe('loadConfig / saveConfig', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeLocalStorageStub())
  })

  it('returns DEFAULT_CONFIG when nothing is stored', () => {
    const cfg = loadConfig()
    expect(cfg).toEqual(DEFAULT_CONFIG)
  })

  it('returns DEFAULT_CONFIG on corrupt / non-JSON data', () => {
    vi.stubGlobal('localStorage', makeLocalStorageStub({ [LS_KEY]: '{{not-json}}' }))
    expect(loadConfig()).toEqual(DEFAULT_CONFIG)
  })

  it('returns DEFAULT_CONFIG when stored object has invalid time strings', () => {
    vi.stubGlobal(
      'localStorage',
      makeLocalStorageStub({ [LS_KEY]: JSON.stringify({ enabled: true, start: 'bad', end: '07:00' }) }),
    )
    expect(loadConfig()).toEqual(DEFAULT_CONFIG)
  })

  it('returns DEFAULT_CONFIG when enabled field is missing', () => {
    vi.stubGlobal(
      'localStorage',
      makeLocalStorageStub({ [LS_KEY]: JSON.stringify({ start: '22:00', end: '07:00' }) }),
    )
    expect(loadConfig()).toEqual(DEFAULT_CONFIG)
  })

  it('round-trips a valid config correctly', () => {
    const custom: QuietHoursConfig = { enabled: true, start: '23:00', end: '06:30' }
    saveConfig(custom)
    expect(loadConfig()).toEqual(custom)
  })

  it('round-trips enabled=false correctly', () => {
    const custom: QuietHoursConfig = { enabled: false, start: '09:00', end: '17:00' }
    saveConfig(custom)
    expect(loadConfig()).toEqual(custom)
  })

  it('handles localStorage.getItem returning null gracefully', () => {
    vi.stubGlobal(
      'localStorage',
      makeLocalStorageStub({ /* empty — getItem returns null */ }),
    )
    expect(loadConfig()).toEqual(DEFAULT_CONFIG)
  })
})
