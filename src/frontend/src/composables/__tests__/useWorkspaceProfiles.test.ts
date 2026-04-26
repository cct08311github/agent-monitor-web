import { describe, it, expect, beforeEach, vi } from 'vitest'

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

// ---------------------------------------------------------------------------
// Mock underlying setters so we only test composable logic
// ---------------------------------------------------------------------------

const mockSetTheme = vi.fn()
vi.mock('@/composables/useTheme', () => ({
  useTheme: () => ({
    currentTheme: { value: 'dark' },
    setTheme: mockSetTheme,
    effectiveTheme: { value: 'dark' },
    cycleTheme: vi.fn(),
  }),
}))

const mockSetTzMode = vi.fn()
vi.mock('@/composables/useTimezone', () => ({
  useTimezone: () => ({
    mode: { value: 'utc' },
    setMode: mockSetTzMode,
    toggle: vi.fn(),
    format: vi.fn(),
  }),
}))

const mockSetPalette = vi.fn()
vi.mock('@/composables/useColorPalette', () => ({
  useColorPalette: () => ({
    palette: { value: 'default' },
    setPalette: mockSetPalette,
    togglePalette: vi.fn(),
    isCbSafe: vi.fn(() => false),
  }),
  bootstrapPalette: vi.fn(),
}))

const mockSetSoundEffectEnabled = vi.fn()
vi.mock('@/composables/useSoundEffect', () => ({
  useSoundEffect: () => ({
    isEnabled: { value: false },
    toggle: vi.fn(),
    setEnabled: mockSetSoundEffectEnabled,
    play: vi.fn(),
  }),
  _resetSoundEffectState: vi.fn(),
}))

// Mock util functions for palette, timezone, sound
vi.mock('@/utils/colorPalette', () => ({
  loadPalette: vi.fn(() => 'default'),
  savePalette: vi.fn(),
  applyPalette: vi.fn(),
}))

vi.mock('@/utils/timezonePref', () => ({
  loadMode: vi.fn(() => 'utc'),
  saveMode: vi.fn(),
}))

vi.mock('@/utils/soundPrefs', () => ({
  isSoundEnabled: vi.fn(() => false),
  setSoundEnabled: vi.fn(),
}))

import { useWorkspaceProfiles, _resetWorkspaceProfilesState } from '../useWorkspaceProfiles'
import { savePalette, applyPalette } from '@/utils/colorPalette'
import { saveMode } from '@/utils/timezonePref'
import { setSoundEnabled } from '@/utils/soundPrefs'

describe('useWorkspaceProfiles', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeLocalStorageStub())
    // Reset module-scoped store between tests
    _resetWorkspaceProfilesState()
    vi.clearAllMocks()
  })

  // ── add ───────────────────────────────────────────────────────────────────

  it('add() appends a profile with the given name', () => {
    const { profiles, add } = useWorkspaceProfiles()
    expect(profiles.value).toHaveLength(0)
    const p = add('On-call')
    expect(profiles.value).toHaveLength(1)
    expect(profiles.value[0].name).toBe('On-call')
    expect(p.name).toBe('On-call')
  })

  it('add() auto-names the profile when name is blank', () => {
    const { profiles, add } = useWorkspaceProfiles()
    add('')
    expect(profiles.value[0].name).toMatch(/設定檔/)
  })

  it('add() captures current themeMode from useTheme', () => {
    const { profiles, add } = useWorkspaceProfiles()
    add('Test')
    expect(profiles.value[0].themeMode).toBe('dark')
  })

  it('add() persists to localStorage', () => {
    const { add } = useWorkspaceProfiles()
    add('Saved')
    expect(localStorage.getItem('oc_workspace_profiles')).not.toBeNull()
  })

  // ── apply ─────────────────────────────────────────────────────────────────

  it('apply() calls setTheme with the profile themeMode', () => {
    const { add, apply } = useWorkspaceProfiles()
    const p = add('Test')
    apply(p)
    expect(mockSetTheme).toHaveBeenCalledWith(p.themeMode)
  })

  it('apply() calls setPalette, savePalette, applyPalette with profile palette', () => {
    const { add, apply } = useWorkspaceProfiles()
    const p = add('Test')
    apply(p)
    expect(mockSetPalette).toHaveBeenCalledWith(p.palette)
    expect(savePalette).toHaveBeenCalledWith(p.palette)
    expect(applyPalette).toHaveBeenCalledWith(p.palette)
  })

  it('apply() calls setMode and saveMode with profile timezoneMode', () => {
    const { add, apply } = useWorkspaceProfiles()
    const p = add('Test')
    apply(p)
    expect(mockSetTzMode).toHaveBeenCalledWith(p.timezoneMode)
    expect(saveMode).toHaveBeenCalledWith(p.timezoneMode)
  })

  it('apply() calls setEnabled and setSoundEnabled with profile soundEnabled', () => {
    const { add, apply } = useWorkspaceProfiles()
    const p = add('Test')
    apply(p)
    expect(mockSetSoundEffectEnabled).toHaveBeenCalledWith(p.soundEnabled)
    expect(setSoundEnabled).toHaveBeenCalledWith(p.soundEnabled)
  })

  it('apply() updates activeId to the applied profile id', () => {
    const { add, apply, activeId } = useWorkspaceProfiles()
    const p = add('Test')
    expect(activeId.value).toBeNull()
    apply(p)
    expect(activeId.value).toBe(p.id)
  })

  // ── remove ────────────────────────────────────────────────────────────────

  it('remove() removes the profile from the list', () => {
    const { profiles, add, remove } = useWorkspaceProfiles()
    const p = add('ToRemove')
    expect(profiles.value).toHaveLength(1)
    remove(p.id)
    expect(profiles.value).toHaveLength(0)
  })

  it('remove() resets activeId if the active profile is removed', () => {
    const { add, apply, remove, activeId } = useWorkspaceProfiles()
    const p = add('Active')
    apply(p)
    expect(activeId.value).toBe(p.id)
    remove(p.id)
    expect(activeId.value).toBeNull()
  })

  it('remove() preserves activeId if a different profile is removed', () => {
    const { add, apply, remove, activeId } = useWorkspaceProfiles()
    const p1 = add('P1')
    const p2 = add('P2')
    apply(p1)
    remove(p2.id)
    expect(activeId.value).toBe(p1.id)
  })

  // ── active computed ───────────────────────────────────────────────────────

  it('active computed returns null when no profile is active', () => {
    const { active } = useWorkspaceProfiles()
    expect(active.value).toBeNull()
  })

  it('active computed returns the applied profile', () => {
    const { add, apply, active } = useWorkspaceProfiles()
    const p = add('Active')
    apply(p)
    expect(active.value?.id).toBe(p.id)
  })
})
