// ---------------------------------------------------------------------------
// useWhatsNew — module-scoped reactive state for the What's New popup
//
// Module-level singleton: all callers share the same `isOpen` ref,
// mirroring the pattern used by useToast / useColorPalette.
//
// Auto-open bootstrap:
//   import { installWhatsNewAutoOpen, teardownWhatsNewAutoOpen } from '@/composables/useWhatsNew'
//   Call installWhatsNewAutoOpen() in App.vue onMounted.
//   Call teardownWhatsNewAutoOpen() in App.vue onUnmounted.
// ---------------------------------------------------------------------------

import { ref } from 'vue'
import { getLastSeenVersion, setLastSeenVersion, hasNewerVersion } from '@/utils/whatsNewState'
import { LATEST_VERSION } from '@/data/whatsNew'

// Module-scoped singleton
const isOpen = ref(false)
let autoStartTimer: ReturnType<typeof setTimeout> | null = null

export function useWhatsNew() {
  return {
    isOpen,
    open: (): void => {
      isOpen.value = true
    },
    close: (): void => {
      isOpen.value = false
    },
    /**
     * Mark the current LATEST_VERSION as seen and close the popup.
     * After this call, the popup will not auto-open again until a newer
     * version is published.
     */
    markSeen: (): void => {
      setLastSeenVersion(LATEST_VERSION)
      isOpen.value = false
    },
  }
}

/**
 * Schedule a one-shot check `delayMs` after call time.
 * If LATEST_VERSION is newer than what is stored in localStorage,
 * the popup opens automatically.
 *
 * Guard: only one timer runs at a time; subsequent calls before the timer
 * fires are ignored.
 */
export function installWhatsNewAutoOpen(delayMs: number = 1500): void {
  if (typeof window === 'undefined') return
  if (autoStartTimer !== null) return

  autoStartTimer = setTimeout(() => {
    if (hasNewerVersion(LATEST_VERSION, getLastSeenVersion())) {
      isOpen.value = true
    }
    autoStartTimer = null
  }, delayMs)
}

/** Cancel the pending auto-open timer (call in App.vue onUnmounted). */
export function teardownWhatsNewAutoOpen(): void {
  if (autoStartTimer !== null) {
    clearTimeout(autoStartTimer)
    autoStartTimer = null
  }
}
