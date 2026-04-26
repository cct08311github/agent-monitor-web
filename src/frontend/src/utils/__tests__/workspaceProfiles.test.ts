import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  loadStore,
  saveStore,
  generateId,
  isValidProfile,
  type WorkspaceProfile,
  type ProfileStore,
} from '../workspaceProfiles'

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

const VALID_PROFILE: WorkspaceProfile = {
  id: 'wp_123_abc',
  name: 'On-call',
  themeMode: 'dark',
  palette: 'default',
  timezoneMode: 'utc',
  soundEnabled: true,
  createdAt: 1700000000000,
}

describe('workspaceProfiles', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeLocalStorageStub())
  })

  // ── loadStore ─────────────────────────────────────────────────────────────

  it('loadStore returns empty store when nothing is stored', () => {
    const s = loadStore()
    expect(s.profiles).toEqual([])
    expect(s.activeId).toBeNull()
  })

  it('loadStore returns empty store on corrupt JSON', () => {
    localStorage.setItem('oc_workspace_profiles', '{not valid json}}}')
    const s = loadStore()
    expect(s.profiles).toEqual([])
    expect(s.activeId).toBeNull()
  })

  it('loadStore returns empty store when parsed value is not an object', () => {
    localStorage.setItem('oc_workspace_profiles', '"just a string"')
    const s = loadStore()
    expect(s.profiles).toEqual([])
    expect(s.activeId).toBeNull()
  })

  it('loadStore filters invalid profile entries', () => {
    const raw: ProfileStore = {
      profiles: [
        VALID_PROFILE,
        { id: 'bad', name: 'missing fields' } as unknown as WorkspaceProfile,
        { ...VALID_PROFILE, palette: 'neon' } as unknown as WorkspaceProfile, // invalid palette
      ],
      activeId: VALID_PROFILE.id,
    }
    localStorage.setItem('oc_workspace_profiles', JSON.stringify(raw))
    const s = loadStore()
    expect(s.profiles).toHaveLength(1)
    expect(s.profiles[0].id).toBe(VALID_PROFILE.id)
  })

  it('loadStore clamps activeId to null when it does not match any profile', () => {
    const raw: ProfileStore = {
      profiles: [VALID_PROFILE],
      activeId: 'nonexistent_id',
    }
    localStorage.setItem('oc_workspace_profiles', JSON.stringify(raw))
    const s = loadStore()
    expect(s.activeId).toBeNull()
  })

  it('loadStore preserves valid activeId', () => {
    const raw: ProfileStore = {
      profiles: [VALID_PROFILE],
      activeId: VALID_PROFILE.id,
    }
    localStorage.setItem('oc_workspace_profiles', JSON.stringify(raw))
    const s = loadStore()
    expect(s.activeId).toBe(VALID_PROFILE.id)
  })

  // ── saveStore round-trip ──────────────────────────────────────────────────

  it('saveStore + loadStore round-trip preserves data', () => {
    const original: ProfileStore = {
      profiles: [VALID_PROFILE],
      activeId: VALID_PROFILE.id,
    }
    saveStore(original)
    const loaded = loadStore()
    expect(loaded.profiles).toHaveLength(1)
    expect(loaded.profiles[0]).toEqual(VALID_PROFILE)
    expect(loaded.activeId).toBe(VALID_PROFILE.id)
  })

  // ── generateId ────────────────────────────────────────────────────────────

  it('generateId returns distinct ids when called with different now values', () => {
    const id1 = generateId(1000)
    const id2 = generateId(2000)
    expect(id1).not.toBe(id2)
    expect(id1).toMatch(/^wp_1000_/)
    expect(id2).toMatch(/^wp_2000_/)
  })

  it('generateId starts with wp_ prefix', () => {
    const id = generateId(Date.now())
    expect(id).toMatch(/^wp_\d+_[a-z0-9]+$/)
  })

  // ── isValidProfile edge cases ─────────────────────────────────────────────

  it('isValidProfile returns false for profile with invalid timezoneMode', () => {
    const bad = { ...VALID_PROFILE, timezoneMode: 'paris' }
    expect(isValidProfile(bad)).toBe(false)
  })

  it('isValidProfile returns false for profile with palette="neon"', () => {
    const bad = { ...VALID_PROFILE, palette: 'neon' }
    expect(isValidProfile(bad)).toBe(false)
  })

  it('isValidProfile returns false for profile with themeMode="solarized"', () => {
    const bad = { ...VALID_PROFILE, themeMode: 'solarized' }
    expect(isValidProfile(bad)).toBe(false)
  })

  it('isValidProfile returns false for non-boolean soundEnabled', () => {
    const bad = { ...VALID_PROFILE, soundEnabled: 'yes' }
    expect(isValidProfile(bad)).toBe(false)
  })

  it('isValidProfile returns false for null', () => {
    expect(isValidProfile(null)).toBe(false)
  })

  it('isValidProfile returns true for a fully valid profile', () => {
    expect(isValidProfile(VALID_PROFILE)).toBe(true)
  })

  it('isValidProfile accepts all valid themeMode values', () => {
    for (const theme of ['light', 'dark', 'auto', 'neon', 'retro'] as const) {
      expect(isValidProfile({ ...VALID_PROFILE, themeMode: theme })).toBe(true)
    }
  })
})
