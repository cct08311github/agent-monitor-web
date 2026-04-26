// ---------------------------------------------------------------------------
// useNotifyPrompt — module-scoped composable for the desktop-notify gentle
// prompt banner.
//
// Usage in the first-alert path:
//   useNotifyPrompt().maybeOpen()   // shows banner if shouldShowPrompt() is true
//
// Usage in NotifyPromptBanner.vue:
//   const { isOpen, enable, decline, later } = useNotifyPrompt()
// ---------------------------------------------------------------------------

import { ref } from 'vue'
import { markShown, shouldShowPrompt } from '@/utils/notifyPromptState'
import { requestPermission, setEnabled } from '@/utils/desktopNotify'
import { useDesktopNotify } from '@/composables/useDesktopNotify'

// ---------------------------------------------------------------------------
// Module-scoped state — shared across all useNotifyPrompt() calls
// ---------------------------------------------------------------------------

const isOpen = ref(false)

// ---------------------------------------------------------------------------
// Public composable
// ---------------------------------------------------------------------------

export function useNotifyPrompt() {
  return {
    /** Whether the banner is currently visible */
    isOpen,

    /** Open the banner unconditionally */
    open: (): void => {
      isOpen.value = true
    },

    /** Close the banner without changing any state */
    close: (): void => {
      isOpen.value = false
    },

    /**
     * Open the banner only when the conditions defined in shouldShowPrompt()
     * are met (permission=default AND not previously shown).
     */
    maybeOpen: (): void => {
      if (shouldShowPrompt()) isOpen.value = true
    },

    /**
     * User clicked "啟用".
     * - Requests the native browser permission.
     * - If granted, enables desktop notifications via setEnabled(true) and
     *   syncs the useDesktopNotify reactive state.
     * - Always marks the prompt as shown and closes the banner.
     * Returns true when the browser granted permission.
     */
    async enable(): Promise<boolean> {
      const result = await requestPermission()
      const dn = useDesktopNotify()
      dn.permission.value = result
      if (result === 'granted') {
        setEnabled(true)
        dn.enabled.value = true
      }
      markShown()
      isOpen.value = false
      return result === 'granted'
    },

    /**
     * User clicked "不要，謝謝".
     * - Marks the prompt as shown (permanent dismiss — never shows again).
     * - Closes the banner.
     */
    decline: (): void => {
      markShown()
      isOpen.value = false
    },

    /**
     * User clicked "之後再問".
     * - Does NOT mark the prompt as shown, so it will reappear next session.
     * - Closes the banner for this session.
     */
    later: (): void => {
      // Intentionally no markShown() call
      isOpen.value = false
    },
  }
}

// ---------------------------------------------------------------------------
// Test helper — reset module state between tests
// ---------------------------------------------------------------------------

/** @internal — for tests only */
export function _resetNotifyPromptState(): void {
  isOpen.value = false
}
