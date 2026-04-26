import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  loadPalette,
  savePalette,
  applyPalette,
  isValidPaletteName,
} from '../colorPalette'

// ---------------------------------------------------------------------------
// localStorage stub (happy-dom does not expose .clear())
// ---------------------------------------------------------------------------

function makeLocalStorageStub(initial: Record<string, string> = {}): Storage {
  const store = new Map<string, string>(Object.entries(initial))
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v)
    },
    removeItem: (k: string) => {
      store.delete(k)
    },
    clear: () => {
      store.clear()
    },
    get length() {
      return store.size
    },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
  } as Storage
}

// ---------------------------------------------------------------------------
// isValidPaletteName
// ---------------------------------------------------------------------------

describe('isValidPaletteName', () => {
  it('returns true for "default"', () => {
    expect(isValidPaletteName('default')).toBe(true)
  })

  it('returns true for "cb-safe"', () => {
    expect(isValidPaletteName('cb-safe')).toBe(true)
  })

  it('returns false for an unknown string "foo"', () => {
    expect(isValidPaletteName('foo')).toBe(false)
  })

  it('returns false for a number', () => {
    expect(isValidPaletteName(123)).toBe(false)
  })

  it('returns false for null', () => {
    expect(isValidPaletteName(null)).toBe(false)
  })

  it('returns false for an empty string', () => {
    expect(isValidPaletteName('')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// loadPalette / savePalette
// ---------------------------------------------------------------------------

describe('loadPalette', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeLocalStorageStub())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns "default" when nothing is stored', () => {
    expect(loadPalette()).toBe('default')
  })

  it('returns "cb-safe" after savePalette("cb-safe")', () => {
    savePalette('cb-safe')
    expect(loadPalette()).toBe('cb-safe')
  })

  it('returns "default" after savePalette("default")', () => {
    savePalette('default')
    expect(loadPalette()).toBe('default')
  })

  it('returns "default" for an invalid stored value', () => {
    vi.stubGlobal('localStorage', makeLocalStorageStub({ oc_color_palette: 'random' }))
    expect(loadPalette()).toBe('default')
  })

  it('returns "default" when localStorage throws on getItem', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('storage blocked')
      },
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      length: 0,
      key: () => null,
    })
    expect(loadPalette()).toBe('default')
  })
})

describe('savePalette', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeLocalStorageStub())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('round-trips cb-safe correctly', () => {
    savePalette('cb-safe')
    expect(loadPalette()).toBe('cb-safe')
  })

  it('round-trips default correctly', () => {
    savePalette('default')
    expect(loadPalette()).toBe('default')
  })

  it('does not throw when localStorage.setItem throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota exceeded')
      },
      removeItem: vi.fn(),
      clear: vi.fn(),
      length: 0,
      key: () => null,
    })
    // savePalette must silently swallow the error
    expect(() => savePalette('cb-safe')).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// applyPalette
// ---------------------------------------------------------------------------

describe('applyPalette', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('data-palette')
  })

  it('sets data-palette="cb-safe" on documentElement', () => {
    applyPalette('cb-safe')
    expect(document.documentElement.getAttribute('data-palette')).toBe('cb-safe')
  })

  it('removes data-palette when applying "default"', () => {
    document.documentElement.setAttribute('data-palette', 'cb-safe')
    applyPalette('default')
    expect(document.documentElement.hasAttribute('data-palette')).toBe(false)
  })

  it('is a no-op when "default" is applied to a clean element', () => {
    applyPalette('default')
    expect(document.documentElement.hasAttribute('data-palette')).toBe(false)
  })
})
