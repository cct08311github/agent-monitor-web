import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  parseHM,
  minutesOf,
  expectedTheme,
  loadConfig,
  saveConfig,
  DEFAULT_CONFIG,
  type ThemeScheduleConfig,
} from '../themeSchedule'

// ---------------------------------------------------------------------------
// localStorage stub
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

const LS_KEY = 'oc_theme_schedule'

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function mockDate(iso: string): Date {
  return new Date(iso)
}

// ---------------------------------------------------------------------------
// parseHM — re-export from quietHours, sanity-check only
// ---------------------------------------------------------------------------

describe('parseHM (re-exported)', () => {
  it('parses 06:00 correctly', () => {
    expect(parseHM('06:00')).toEqual({ h: 6, m: 0 })
  })

  it('returns null for invalid string', () => {
    expect(parseHM('bad')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// minutesOf — re-export from quietHours
// ---------------------------------------------------------------------------

describe('minutesOf (re-exported)', () => {
  it('converts 06:00 to 360', () => {
    expect(minutesOf('06:00')).toBe(360)
  })

  it('converts 18:00 to 1080', () => {
    expect(minutesOf('18:00')).toBe(1080)
  })

  it('returns NaN for invalid string', () => {
    expect(minutesOf('bad')).toBeNaN()
  })
})

// ---------------------------------------------------------------------------
// expectedTheme — disabled
// ---------------------------------------------------------------------------

describe('expectedTheme — disabled', () => {
  it('returns null when enabled is false', () => {
    const config: ThemeScheduleConfig = { enabled: false, lightAt: '06:00', darkAt: '18:00' }
    expect(expectedTheme(config, mockDate('2026-04-26T14:00:00'))).toBeNull()
    expect(expectedTheme(config, mockDate('2026-04-26T04:00:00'))).toBeNull()
    expect(expectedTheme(config, mockDate('2026-04-26T20:00:00'))).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// expectedTheme — same-day window (06:00..18:00)
// ---------------------------------------------------------------------------

describe('expectedTheme — same-day window (lightAt=06:00, darkAt=18:00)', () => {
  const config: ThemeScheduleConfig = { enabled: true, lightAt: '06:00', darkAt: '18:00' }

  it('returns light at 14:00 (midday)', () => {
    expect(expectedTheme(config, mockDate('2026-04-26T14:00:00'))).toBe('light')
  })

  it('returns light at 06:00 (start boundary, inclusive)', () => {
    expect(expectedTheme(config, mockDate('2026-04-26T06:00:00'))).toBe('light')
  })

  it('returns dark at 04:00 (before light window)', () => {
    expect(expectedTheme(config, mockDate('2026-04-26T04:00:00'))).toBe('dark')
  })

  it('returns dark at 20:00 (after light window)', () => {
    expect(expectedTheme(config, mockDate('2026-04-26T20:00:00'))).toBe('dark')
  })

  it('returns dark at 18:00 (end boundary — darkAt is exclusive start of dark)', () => {
    // cur (18:00 = 1080) is NOT < dark (1080), so falls out of light window → 'dark'
    expect(expectedTheme(config, mockDate('2026-04-26T18:00:00'))).toBe('dark')
  })

  it('returns light at 17:59 (just before darkAt)', () => {
    expect(expectedTheme(config, mockDate('2026-04-26T17:59:00'))).toBe('light')
  })

  it('returns dark at 00:00 (midnight)', () => {
    expect(expectedTheme(config, mockDate('2026-04-26T00:00:00'))).toBe('dark')
  })
})

// ---------------------------------------------------------------------------
// expectedTheme — overnight light window (lightAt=18:00, darkAt=06:00)
// ---------------------------------------------------------------------------

describe('expectedTheme — overnight light window (lightAt=18:00, darkAt=06:00)', () => {
  const config: ThemeScheduleConfig = { enabled: true, lightAt: '18:00', darkAt: '06:00' }

  it('returns light at 02:00 (post-midnight, still in light window)', () => {
    expect(expectedTheme(config, mockDate('2026-04-26T02:00:00'))).toBe('light')
  })

  it('returns light at 22:00 (evening)', () => {
    expect(expectedTheme(config, mockDate('2026-04-26T22:00:00'))).toBe('light')
  })

  it('returns dark at 12:00 (midday, in dark window)', () => {
    expect(expectedTheme(config, mockDate('2026-04-26T12:00:00'))).toBe('dark')
  })

  it('returns dark at 06:00 (darkAt boundary — light window ends at darkAt exclusive)', () => {
    // cur (6:00 = 360) NOT >= light (1080) AND NOT < dark (360) → dark
    expect(expectedTheme(config, mockDate('2026-04-26T06:00:00'))).toBe('dark')
  })

  it('returns light at 05:59 (just before darkAt)', () => {
    expect(expectedTheme(config, mockDate('2026-04-26T05:59:00'))).toBe('light')
  })

  it('returns light at 18:00 (lightAt boundary, inclusive)', () => {
    expect(expectedTheme(config, mockDate('2026-04-26T18:00:00'))).toBe('light')
  })
})

// ---------------------------------------------------------------------------
// expectedTheme — edge cases
// ---------------------------------------------------------------------------

describe('expectedTheme — edge cases', () => {
  it('returns null when lightAt === darkAt (zero-length window)', () => {
    const config: ThemeScheduleConfig = { enabled: true, lightAt: '12:00', darkAt: '12:00' }
    expect(expectedTheme(config, mockDate('2026-04-26T12:00:00'))).toBeNull()
    expect(expectedTheme(config, mockDate('2026-04-26T12:01:00'))).toBeNull()
  })

  it('returns null when lightAt is invalid', () => {
    const config: ThemeScheduleConfig = { enabled: true, lightAt: 'bad', darkAt: '18:00' }
    expect(expectedTheme(config, mockDate('2026-04-26T14:00:00'))).toBeNull()
  })

  it('returns null when darkAt is invalid', () => {
    const config: ThemeScheduleConfig = { enabled: true, lightAt: '06:00', darkAt: 'bad' }
    expect(expectedTheme(config, mockDate('2026-04-26T14:00:00'))).toBeNull()
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
    expect(loadConfig()).toEqual(DEFAULT_CONFIG)
  })

  it('returns DEFAULT_CONFIG on corrupt / non-JSON data', () => {
    vi.stubGlobal('localStorage', makeLocalStorageStub({ [LS_KEY]: '{{not-json}}' }))
    expect(loadConfig()).toEqual(DEFAULT_CONFIG)
  })

  it('returns DEFAULT_CONFIG when stored config has invalid lightAt', () => {
    vi.stubGlobal(
      'localStorage',
      makeLocalStorageStub({
        [LS_KEY]: JSON.stringify({ enabled: true, lightAt: 'bad', darkAt: '18:00' }),
      }),
    )
    expect(loadConfig()).toEqual(DEFAULT_CONFIG)
  })

  it('returns DEFAULT_CONFIG when stored config has invalid darkAt', () => {
    vi.stubGlobal(
      'localStorage',
      makeLocalStorageStub({
        [LS_KEY]: JSON.stringify({ enabled: true, lightAt: '06:00', darkAt: 'bad' }),
      }),
    )
    expect(loadConfig()).toEqual(DEFAULT_CONFIG)
  })

  it('returns DEFAULT_CONFIG when enabled field is missing', () => {
    vi.stubGlobal(
      'localStorage',
      makeLocalStorageStub({
        [LS_KEY]: JSON.stringify({ lightAt: '06:00', darkAt: '18:00' }),
      }),
    )
    expect(loadConfig()).toEqual(DEFAULT_CONFIG)
  })

  it('round-trips a valid config (enabled=true) correctly', () => {
    const custom: ThemeScheduleConfig = { enabled: true, lightAt: '07:00', darkAt: '20:00' }
    saveConfig(custom)
    expect(loadConfig()).toEqual(custom)
  })

  it('round-trips enabled=false config correctly', () => {
    const custom: ThemeScheduleConfig = { enabled: false, lightAt: '06:00', darkAt: '18:00' }
    saveConfig(custom)
    expect(loadConfig()).toEqual(custom)
  })

  it('round-trips an overnight config correctly', () => {
    const custom: ThemeScheduleConfig = { enabled: true, lightAt: '18:00', darkAt: '06:00' }
    saveConfig(custom)
    expect(loadConfig()).toEqual(custom)
  })
})

// ---------------------------------------------------------------------------
// DEFAULT_CONFIG shape
// ---------------------------------------------------------------------------

describe('DEFAULT_CONFIG', () => {
  it('has expected default values', () => {
    expect(DEFAULT_CONFIG).toEqual({
      enabled: false,
      lightAt: '06:00',
      darkAt: '18:00',
    })
  })
})
