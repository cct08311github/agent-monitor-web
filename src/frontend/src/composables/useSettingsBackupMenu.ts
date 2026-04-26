// ---------------------------------------------------------------------------
// useSettingsBackupMenu — manages open/close state for SettingsBackupMenu.
// Module-scoped so KeyboardShortcutsHelp and App.vue can control visibility
// without prop drilling.
// ---------------------------------------------------------------------------

import { ref } from 'vue'

const isOpen = ref(false)

export function useSettingsBackupMenu() {
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
