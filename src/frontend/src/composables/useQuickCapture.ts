/**
 * useQuickCapture — module-scoped composable for quick idea capture.
 *
 * Provides reactive open/close state for both the input modal and the list
 * modal, plus add/remove/clear operations that keep the reactive `captures`
 * ref in sync with localStorage.
 *
 * Call `installQuickCaptureHotkey()` once in App.vue onMounted to attach the
 * global Cmd+Shift+N / Ctrl+Shift+N listener.
 */

import { ref } from 'vue'
import {
  loadCaptures,
  addCapture as addUtil,
  deleteCapture as delUtil,
  clearCaptures as clearUtil,
  updateCapture as updateCaptureUtil,
  type Capture,
} from '@/utils/quickCapture'

// ---------------------------------------------------------------------------
// Module-scoped shared state
// ---------------------------------------------------------------------------

const isOpen = ref(false)
const isListOpen = ref(false)
const captures = ref<Capture[]>(loadCaptures())

let installed = false
let keydownHandler: ((e: KeyboardEvent) => void) | null = null

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function refreshFromStorage(): void {
  captures.value = loadCaptures()
}

// ---------------------------------------------------------------------------
// Public composable
// ---------------------------------------------------------------------------

export function useQuickCapture() {
  return {
    isOpen,
    isListOpen,
    captures,
    open: () => {
      isOpen.value = true
    },
    close: () => {
      isOpen.value = false
    },
    openList: () => {
      refreshFromStorage()
      isListOpen.value = true
    },
    closeList: () => {
      isListOpen.value = false
    },
    add: (body: string, context: string): Capture => {
      const c = addUtil(body, context)
      captures.value = [c, ...captures.value].slice(0, 100)
      return c
    },
    remove: (id: string): void => {
      delUtil(id)
      captures.value = captures.value.filter((c) => c.id !== id)
    },
    update: (id: string, body: string): Capture | null => {
      const updated = updateCaptureUtil(id, body)
      if (updated) {
        captures.value = captures.value.map((c) => (c.id === id ? updated : c))
      }
      return updated
    },
    clear: (): void => {
      clearUtil()
      captures.value = []
    },
  }
}

// ---------------------------------------------------------------------------
// Global hotkey installer / teardown
// ---------------------------------------------------------------------------

/**
 * Attach the global Cmd+Shift+N / Ctrl+Shift+N listener.
 * Safe to call multiple times — installs exactly once.
 */
export function installQuickCaptureHotkey(): void {
  if (installed) return
  if (typeof window === 'undefined') return
  installed = true
  keydownHandler = (e: KeyboardEvent): void => {
    const isMacMod = e.metaKey
    const isWinMod = e.ctrlKey
    if ((isMacMod || isWinMod) && e.shiftKey && e.key.toLowerCase() === 'n') {
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
export function teardownQuickCaptureHotkey(): void {
  if (keydownHandler) {
    window.removeEventListener('keydown', keydownHandler)
  }
  keydownHandler = null
  installed = false
}
