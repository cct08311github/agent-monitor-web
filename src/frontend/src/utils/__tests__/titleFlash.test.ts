import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  isFlashEnabled,
  setFlashEnabled,
  startFlash,
  isCurrentlyFlashing,
  _resetFlashState,
} from '../titleFlash'

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockMatchMedia(reducedMotion: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: reducedMotion && query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  )
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.useFakeTimers()
  _resetFlashState()
  vi.stubGlobal('localStorage', makeLocalStorageStub())
  // Default: no reduced-motion
  mockMatchMedia(false)
  document.title = 'Agent Monitor'
})

afterEach(() => {
  _resetFlashState()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

// ---------------------------------------------------------------------------
// Preference helpers
// ---------------------------------------------------------------------------

describe('isFlashEnabled', () => {
  it('returns true by default (no localStorage entry)', () => {
    expect(isFlashEnabled()).toBe(true)
  })

  it('returns false when stored value is "0"', () => {
    localStorage.setItem('oc_title_flash_enabled', '0')
    expect(isFlashEnabled()).toBe(false)
  })

  it('returns true when stored value is "1"', () => {
    localStorage.setItem('oc_title_flash_enabled', '1')
    expect(isFlashEnabled()).toBe(true)
  })
})

describe('setFlashEnabled', () => {
  it('persists false and isFlashEnabled() reflects it', () => {
    setFlashEnabled(false)
    expect(isFlashEnabled()).toBe(false)
  })

  it('persists true and isFlashEnabled() reflects it', () => {
    setFlashEnabled(false)
    setFlashEnabled(true)
    expect(isFlashEnabled()).toBe(true)
  })

  it('round-trip: false → true → false', () => {
    setFlashEnabled(false)
    expect(isFlashEnabled()).toBe(false)
    setFlashEnabled(true)
    expect(isFlashEnabled()).toBe(true)
    setFlashEnabled(false)
    expect(isFlashEnabled()).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// startFlash — title flipping
// ---------------------------------------------------------------------------

describe('startFlash', () => {
  it('modifies document.title to FLASH_TEXT after first interval tick', () => {
    const originalTitle = document.title
    startFlash(10_000, 1_200)

    expect(document.title).toBe(originalTitle) // not yet changed

    vi.advanceTimersByTime(1_200)
    expect(document.title).toBe('🔴 新 ALERT')

    vi.advanceTimersByTime(1_200)
    expect(document.title).toBe(originalTitle)
  })

  it('marks isCurrentlyFlashing() as true while running', () => {
    startFlash(10_000, 1_200)
    expect(isCurrentlyFlashing()).toBe(true)
  })

  it('auto-stops after duration and restores original title', () => {
    const originalTitle = document.title
    startFlash(5_000, 1_200)

    vi.advanceTimersByTime(5_000)
    expect(isCurrentlyFlashing()).toBe(false)
    expect(document.title).toBe(originalTitle)
  })

  it('does NOT overlap when called while already flashing — first flash continues', () => {
    startFlash(10_000, 1_200)
    expect(isCurrentlyFlashing()).toBe(true)

    // Advance so first flash swaps title
    vi.advanceTimersByTime(1_200)
    expect(document.title).toBe('🔴 新 ALERT')

    // Second call while already flashing should be a no-op
    const stopFromSecondCall = startFlash(10_000, 500)
    // The returned function should be the same stopFlash
    expect(typeof stopFromSecondCall).toBe('function')
    // Flash should still be running (not reset)
    expect(isCurrentlyFlashing()).toBe(true)
    // Another interval tick continues at 1200ms pace
    vi.advanceTimersByTime(1_200)
    expect(document.title).toBe('Agent Monitor')
  })

  it('returned cancel function stops flash immediately and restores title', () => {
    const originalTitle = document.title
    const stop = startFlash(10_000, 1_200)

    vi.advanceTimersByTime(1_200)
    expect(document.title).toBe('🔴 新 ALERT')

    stop()
    expect(isCurrentlyFlashing()).toBe(false)
    expect(document.title).toBe(originalTitle)
  })

  it('is a no-op when prefers-reduced-motion is set', () => {
    mockMatchMedia(true)
    const originalTitle = document.title
    startFlash(10_000, 1_200)

    vi.advanceTimersByTime(5_000)
    expect(document.title).toBe(originalTitle)
    expect(isCurrentlyFlashing()).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// _resetFlashState
// ---------------------------------------------------------------------------

describe('_resetFlashState', () => {
  it('stops an active flash and restores title', () => {
    const originalTitle = document.title
    startFlash(10_000, 1_200)
    vi.advanceTimersByTime(1_200)
    expect(document.title).toBe('🔴 新 ALERT')

    _resetFlashState()
    expect(isCurrentlyFlashing()).toBe(false)
    expect(document.title).toBe(originalTitle)
  })
})
