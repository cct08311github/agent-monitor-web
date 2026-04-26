import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getLastSeenVersion, setLastSeenVersion, hasNewerVersion } from '../whatsNewState'

function makeLocalStorageStub(seed: Record<string, string> = {}) {
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

describe('whatsNewState', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeLocalStorageStub())
  })

  // ── getLastSeenVersion ──────────────────────────────────────────────────────

  it('getLastSeenVersion returns null when nothing stored', () => {
    expect(getLastSeenVersion()).toBeNull()
  })

  it('setLastSeenVersion + getLastSeenVersion round-trip', () => {
    setLastSeenVersion('2026.04.26')
    expect(getLastSeenVersion()).toBe('2026.04.26')
  })

  it('getLastSeenVersion is silent when localStorage throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('no storage') },
      setItem: () => { throw new Error('no storage') },
    } as unknown as Storage)
    expect(getLastSeenVersion()).toBeNull()
  })

  it('setLastSeenVersion is silent when localStorage throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => { throw new Error('no storage') },
    } as unknown as Storage)
    expect(() => setLastSeenVersion('2026.04.26')).not.toThrow()
  })

  // ── hasNewerVersion ─────────────────────────────────────────────────────────

  it('hasNewerVersion returns true when lastSeen is null', () => {
    expect(hasNewerVersion('2026.04.26', null)).toBe(true)
  })

  it('hasNewerVersion returns false when versions are equal', () => {
    expect(hasNewerVersion('2026.04.26', '2026.04.26')).toBe(false)
  })

  it('hasNewerVersion returns true when latest is one day ahead', () => {
    expect(hasNewerVersion('2026.04.26', '2026.04.25')).toBe(true)
  })

  it('hasNewerVersion returns false when latest is one day behind', () => {
    expect(hasNewerVersion('2026.04.25', '2026.04.26')).toBe(false)
  })

  it('hasNewerVersion returns true across year boundary', () => {
    expect(hasNewerVersion('2027.01.01', '2026.12.31')).toBe(true)
  })

  it('hasNewerVersion returns true when month flips', () => {
    expect(hasNewerVersion('2026.05.01', '2026.04.30')).toBe(true)
  })

  it('hasNewerVersion returns false when latest is older (year comparison)', () => {
    expect(hasNewerVersion('2025.12.31', '2026.01.01')).toBe(false)
  })

  it('hasNewerVersion returns false for malformed input (defensive)', () => {
    expect(hasNewerVersion('bad', 'bad')).toBe(false)
  })
})
