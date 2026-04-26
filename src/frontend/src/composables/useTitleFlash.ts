// ---------------------------------------------------------------------------
// useTitleFlash — reactive wrapper around titleFlash util
//
// Exposes:
//   enabled  — reactive boolean (synced from/to localStorage)
//   toggle() — flip the preference and persist
//   flash()  — trigger a flash if enabled
// ---------------------------------------------------------------------------

import { ref } from 'vue'
import { isFlashEnabled, setFlashEnabled, startFlash } from '@/utils/titleFlash'

const enabled = ref(isFlashEnabled())

export function useTitleFlash() {
  return {
    enabled,
    toggle(): void {
      enabled.value = !enabled.value
      setFlashEnabled(enabled.value)
    },
    flash(): void {
      // Always re-read from localStorage so tests that stub storage work correctly
      if (!isFlashEnabled()) return
      startFlash()
    },
  }
}
