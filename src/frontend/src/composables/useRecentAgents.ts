/**
 * useRecentAgents — module-scoped composable for recent agent tracking.
 *
 * Provides reactive open/close state for the RecentAgentsPopover plus
 * visit/clear operations that keep the reactive `recents` ref in sync
 * with localStorage.
 *
 * Call `installRecentAgentsHotkey()` once in App.vue onMounted to attach the
 * global Cmd+J / Ctrl+J listener.
 */

import { ref } from 'vue'
import { loadRecents, recordVisit, clearRecents } from '@/utils/recentAgents'

// ---------------------------------------------------------------------------
// Module-scoped shared state
// ---------------------------------------------------------------------------

const recents = ref<string[]>(loadRecents())
const isOpen = ref(false)

let installed = false
let keydownHandler: ((e: KeyboardEvent) => void) | null = null

// ---------------------------------------------------------------------------
// Public composable
// ---------------------------------------------------------------------------

export function useRecentAgents() {
  return {
    recents,
    isOpen,
    open: (): void => {
      isOpen.value = true
    },
    close: (): void => {
      isOpen.value = false
    },
    visit: (agentId: string): void => {
      const next = recordVisit(agentId)
      recents.value = next
    },
    clear: (): void => {
      clearRecents()
      recents.value = []
    },
  }
}

// ---------------------------------------------------------------------------
// Global hotkey installer / teardown
// ---------------------------------------------------------------------------

/**
 * Attach the global Cmd+J / Ctrl+J listener.
 * Safe to call multiple times — installs exactly once.
 */
export function installRecentAgentsHotkey(): void {
  if (installed) return
  if (typeof window === 'undefined') return
  installed = true
  keydownHandler = (e: KeyboardEvent): void => {
    const isMod = e.metaKey || e.ctrlKey
    if (isMod && !e.shiftKey && e.key.toLowerCase() === 'j') {
      e.preventDefault()
      isOpen.value = true
    }
  }
  window.addEventListener('keydown', keydownHandler)
}

/**
 * Remove the global hotkey listener.
 * Call in App.vue onUnmounted.
 */
export function teardownRecentAgentsHotkey(): void {
  if (keydownHandler) {
    window.removeEventListener('keydown', keydownHandler)
  }
  keydownHandler = null
  installed = false
}
