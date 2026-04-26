import { describe, it, expect, beforeEach, vi } from 'vitest'
import { isSoundEnabled, setSoundEnabled } from '../soundPrefs'

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

describe('soundPrefs', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeLocalStorageStub())
  })

  it('returns false by default when key is absent', () => {
    expect(isSoundEnabled()).toBe(false)
  })

  it('returns false when value is "0"', () => {
    localStorage.setItem('oc_sound_enabled', '0')
    expect(isSoundEnabled()).toBe(false)
  })

  it('setSoundEnabled(true) stores "1" and isSoundEnabled() returns true', () => {
    setSoundEnabled(true)
    expect(localStorage.getItem('oc_sound_enabled')).toBe('1')
    expect(isSoundEnabled()).toBe(true)
  })

  it('setSoundEnabled(false) stores "0" and isSoundEnabled() returns false', () => {
    setSoundEnabled(true)
    setSoundEnabled(false)
    expect(localStorage.getItem('oc_sound_enabled')).toBe('0')
    expect(isSoundEnabled()).toBe(false)
  })

  it('returns false for a corrupt / unexpected stored value', () => {
    localStorage.setItem('oc_sound_enabled', 'yes')
    expect(isSoundEnabled()).toBe(false)
  })

  it('setSoundEnabled round-trip: true → false → true', () => {
    setSoundEnabled(true)
    expect(isSoundEnabled()).toBe(true)
    setSoundEnabled(false)
    expect(isSoundEnabled()).toBe(false)
    setSoundEnabled(true)
    expect(isSoundEnabled()).toBe(true)
  })
})
