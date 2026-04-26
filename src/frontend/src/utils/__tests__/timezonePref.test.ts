import { describe, it, expect, beforeEach, vi } from 'vitest'
import { loadMode, saveMode, isValidMode } from '../timezonePref'

// ---------------------------------------------------------------------------
// localStorage mock
// ---------------------------------------------------------------------------

const store: Record<string, string> = {}

const localStorageMock = {
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
}

vi.stubGlobal('localStorage', localStorageMock)

const KEY = 'oc_timezone_mode'

beforeEach(() => {
  localStorageMock.clear()
})

// ---------------------------------------------------------------------------
// isValidMode
// ---------------------------------------------------------------------------

describe('isValidMode', () => {
  it('returns true for "local"', () => {
    expect(isValidMode('local')).toBe(true)
  })

  it('returns true for "utc"', () => {
    expect(isValidMode('utc')).toBe(true)
  })

  it('returns false for unknown string "PST"', () => {
    expect(isValidMode('PST')).toBe(false)
  })

  it('returns false for number input', () => {
    expect(isValidMode(123)).toBe(false)
  })

  it('returns false for null', () => {
    expect(isValidMode(null)).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(isValidMode('')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// loadMode
// ---------------------------------------------------------------------------

describe('loadMode', () => {
  it('returns "local" when nothing is stored (default)', () => {
    expect(loadMode()).toBe('local')
  })

  it('returns "utc" when stored value is "utc"', () => {
    store[KEY] = 'utc'
    expect(loadMode()).toBe('utc')
  })

  it('returns "local" on corrupt / invalid stored value', () => {
    store[KEY] = 'PST'
    expect(loadMode()).toBe('local')
  })

  it('returns "local" when stored value is a number string', () => {
    store[KEY] = '0'
    expect(loadMode()).toBe('local')
  })
})

// ---------------------------------------------------------------------------
// saveMode + loadMode round-trip
// ---------------------------------------------------------------------------

describe('saveMode → loadMode round-trip', () => {
  it('persists "utc" and reads it back', () => {
    saveMode('utc')
    expect(loadMode()).toBe('utc')
  })

  it('persists "local" and reads it back', () => {
    saveMode('utc')
    saveMode('local')
    expect(loadMode()).toBe('local')
  })
})

// ---------------------------------------------------------------------------
// localStorage failure (e.g. private browsing quota exceeded)
// ---------------------------------------------------------------------------

describe('loadMode on localStorage error', () => {
  it('returns "local" when localStorage.getItem throws', () => {
    const throwing = {
      ...localStorageMock,
      getItem: () => {
        throw new Error('SecurityError')
      },
    }
    vi.stubGlobal('localStorage', throwing)
    expect(loadMode()).toBe('local')
    vi.stubGlobal('localStorage', localStorageMock)
  })
})
