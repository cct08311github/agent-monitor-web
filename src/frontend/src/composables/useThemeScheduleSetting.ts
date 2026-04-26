// ---------------------------------------------------------------------------
// useThemeScheduleSetting — manages the open/close state of the theme
// schedule settings modal. Module-scoped so KeyboardShortcutsHelp and App.vue
// can both control visibility without prop drilling.
// ---------------------------------------------------------------------------

import { ref } from 'vue'

const isOpen = ref(false)

export function useThemeScheduleSetting() {
  return {
    isOpen,
    open: (): void => {
      isOpen.value = true
    },
    close: (): void => {
      isOpen.value = false
    },
  }
}
