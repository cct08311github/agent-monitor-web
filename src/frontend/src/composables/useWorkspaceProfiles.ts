// ---------------------------------------------------------------------------
// useWorkspaceProfiles — named personalization snapshots
//
// Bundles 4 settings (theme, palette, timezone, sound) into named profiles.
// Persists to localStorage via workspaceProfiles util.
//
// Usage:
//   const { profiles, activeId, active, add, apply, remove } = useWorkspaceProfiles()
//   add('On-call')            // captures current settings, saves with name
//   apply(profiles.value[0]) // applies all 4 settings + marks as active
//   remove(profiles.value[0].id)
// ---------------------------------------------------------------------------

import { ref, computed } from 'vue'
import {
  loadStore,
  saveStore,
  generateId,
  type WorkspaceProfile,
  type ProfileStore,
} from '@/utils/workspaceProfiles'
import { loadMode as loadTzMode, saveMode as saveTzMode, type TimezoneMode } from '@/utils/timezonePref'
import { loadPalette, savePalette, applyPalette, type PaletteName } from '@/utils/colorPalette'
import { isSoundEnabled, setSoundEnabled } from '@/utils/soundPrefs'
import { useTheme, type ThemeMode } from '@/composables/useTheme'
import { useTimezone } from '@/composables/useTimezone'
import { useColorPalette } from '@/composables/useColorPalette'
import { useSoundEffect } from '@/composables/useSoundEffect'

// Module-scoped singleton store
const store = ref<ProfileStore>(loadStore())

export function useWorkspaceProfiles() {
  const { currentTheme, setTheme } = useTheme()
  const { setMode: setTzMode } = useTimezone()
  const { setPalette } = useColorPalette()
  const { setEnabled: setSoundEffectEnabled } = useSoundEffect()

  function captureCurrent(name: string): WorkspaceProfile {
    return {
      id: generateId(),
      name: name.trim() || `設定檔 ${store.value.profiles.length + 1}`,
      themeMode: currentTheme.value as ThemeMode,
      palette: loadPalette(),
      timezoneMode: loadTzMode(),
      soundEnabled: isSoundEnabled(),
      createdAt: Date.now(),
    }
  }

  function add(name: string): WorkspaceProfile {
    const p = captureCurrent(name)
    store.value = { ...store.value, profiles: [...store.value.profiles, p] }
    saveStore(store.value)
    return p
  }

  function apply(p: WorkspaceProfile): void {
    // Apply theme via reactive composable (updates DOM + persists)
    setTheme(p.themeMode as ThemeMode)
    // Apply palette via composable (updates DOM + persists)
    setPalette(p.palette as PaletteName)
    // Apply timezone via composable (updates reactive state + persists)
    setTzMode(p.timezoneMode as TimezoneMode)
    // Also persist directly (belt-and-suspenders for palette/tz util state)
    savePalette(p.palette as PaletteName)
    applyPalette(p.palette as PaletteName)
    saveTzMode(p.timezoneMode as TimezoneMode)
    // Apply sound via composable + util
    setSoundEffectEnabled(p.soundEnabled)
    setSoundEnabled(p.soundEnabled)
    // Mark active
    store.value = { ...store.value, activeId: p.id }
    saveStore(store.value)
  }

  function remove(id: string): void {
    const next: ProfileStore = {
      profiles: store.value.profiles.filter((p) => p.id !== id),
      activeId: store.value.activeId === id ? null : store.value.activeId,
    }
    store.value = next
    saveStore(next)
  }

  return {
    profiles: computed(() => store.value.profiles),
    activeId: computed(() => store.value.activeId),
    active: computed(() => store.value.profiles.find((p) => p.id === store.value.activeId) ?? null),
    add,
    apply,
    remove,
  }
}

// ---------------------------------------------------------------------------
// Test helper
// ---------------------------------------------------------------------------

/** @internal — resets module-scoped store. For tests only. */
export function _resetWorkspaceProfilesState(): void {
  store.value = loadStore()
}
