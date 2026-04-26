// ---------------------------------------------------------------------------
// useSoundEffect — reactive sound-effect toggle composable
//
// Module-scoped `enabled` ref so all callers share the same on/off state.
// Reads initial value from localStorage via soundPrefs; persists changes back.
//
// Usage:
//   const { isEnabled, toggle, play } = useSoundEffect()
//   play('success')   // plays only when enabled and not in quiet hours
//   toggle()          // flips enabled and persists
// ---------------------------------------------------------------------------

import { ref, computed } from 'vue'
import { isSoundEnabled, setSoundEnabled } from '@/utils/soundPrefs'
import { playBeep, type BeepVariant } from '@/utils/soundEffect'
import { isQuietNow } from '@/composables/useQuietHours'

// Module-scoped state — shared across all useSoundEffect() calls
const enabled = ref(isSoundEnabled())

export function useSoundEffect() {
  return {
    /** Reactive flag — true when sound is enabled. */
    isEnabled: computed(() => enabled.value),

    /** Flips the enabled state and persists to localStorage. */
    toggle: (): void => {
      enabled.value = !enabled.value
      setSoundEnabled(enabled.value)
    },

    /** Explicitly sets the enabled state and persists to localStorage. */
    setEnabled: (v: boolean): void => {
      enabled.value = v
      setSoundEnabled(v)
    },

    /**
     * Plays a synthesized beep if sound is enabled and not in quiet hours.
     * Silent no-op otherwise — safe to call unconditionally.
     */
    play: (variant: BeepVariant): void => {
      if (!enabled.value) return
      if (isQuietNow()) return
      playBeep(variant)
    },
  }
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** @internal — resets the module-scoped enabled ref. For tests only. */
export function _resetSoundEffectState(): void {
  enabled.value = isSoundEnabled()
}
