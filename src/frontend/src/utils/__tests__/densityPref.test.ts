import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  loadDensity,
  saveDensity,
  applyDensity,
  isValidDensity,
  type DensityMode,
} from '../densityPref'

// ---------------------------------------------------------------------------
// localStorage mock
// ---------------------------------------------------------------------------

const store: Record<string, string> = {}

const localStorageMock = {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    store[key] = value
  }),
  removeItem: vi.fn((key: string) => {
    delete store[key]
  }),
  clear: vi.fn(() => {
    Object.keys(store).forEach((k) => delete store[k])
  }),
}

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorageMock.clear()
  vi.clearAllMocks()
  // Reset document attribute between tests
  if (typeof document !== 'undefined') {
    document.documentElement.removeAttribute('data-density')
  }
})

describe('isValidDensity', () => {
  it('returns true for "comfortable"', () => {
    expect(isValidDensity('comfortable')).toBe(true)
  })

  it('returns true for "compact"', () => {
    expect(isValidDensity('compact')).toBe(true)
  })

  it('returns false for arbitrary string', () => {
    expect(isValidDensity('foo')).toBe(false)
  })

  it('returns false for number', () => {
    expect(isValidDensity(123)).toBe(false)
  })

  it('returns false for null', () => {
    expect(isValidDensity(null)).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(isValidDensity(undefined)).toBe(false)
  })
})

describe('loadDensity', () => {
  it('returns "comfortable" by default when nothing is stored', () => {
    expect(loadDensity()).toBe('comfortable')
  })

  it('returns stored "compact" after saveDensity("compact")', () => {
    saveDensity('compact')
    expect(loadDensity()).toBe('compact')
  })

  it('returns stored "comfortable" after saveDensity("comfortable")', () => {
    saveDensity('comfortable')
    expect(loadDensity()).toBe('comfortable')
  })

  it('returns "comfortable" when stored value is invalid', () => {
    store['oc_density'] = 'invalid-value'
    expect(loadDensity()).toBe('comfortable')
  })

  it('returns "comfortable" when localStorage throws', () => {
    localStorageMock.getItem.mockImplementationOnce(() => {
      throw new Error('storage unavailable')
    })
    expect(loadDensity()).toBe('comfortable')
  })
})

describe('saveDensity', () => {
  it('persists "compact" to localStorage', () => {
    saveDensity('compact')
    expect(localStorageMock.setItem).toHaveBeenCalledWith('oc_density', 'compact')
  })

  it('persists "comfortable" to localStorage', () => {
    saveDensity('comfortable')
    expect(localStorageMock.setItem).toHaveBeenCalledWith('oc_density', 'comfortable')
  })

  it('does not throw when localStorage throws', () => {
    localStorageMock.setItem.mockImplementationOnce(() => {
      throw new Error('QuotaExceededError')
    })
    expect(() => saveDensity('compact')).not.toThrow()
  })
})

describe('applyDensity', () => {
  it('sets data-density="compact" on documentElement for compact mode', () => {
    applyDensity('compact')
    expect(document.documentElement.getAttribute('data-density')).toBe('compact')
  })

  it('removes data-density attribute for comfortable mode', () => {
    // First set compact
    document.documentElement.setAttribute('data-density', 'compact')
    // Then apply comfortable
    applyDensity('comfortable')
    expect(document.documentElement.hasAttribute('data-density')).toBe(false)
  })

  it('does not set data-density when comfortable (no attribute present)', () => {
    applyDensity('comfortable')
    expect(document.documentElement.hasAttribute('data-density')).toBe(false)
  })
})

describe('loadDensity / saveDensity round-trip', () => {
  it('round-trips compact mode', () => {
    saveDensity('compact')
    expect(loadDensity()).toBe<DensityMode>('compact')
  })

  it('round-trips comfortable mode', () => {
    saveDensity('comfortable')
    expect(loadDensity()).toBe<DensityMode>('comfortable')
  })
})
