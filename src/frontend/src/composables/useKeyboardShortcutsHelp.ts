/**
 * useKeyboardShortcutsHelp — manages the open/close state of the
 * keyboard shortcuts cheatsheet overlay.
 *
 * Module-level `isOpen` is shared across all callers so any component can
 * read or mutate the same singleton state.
 *
 * Call `installShortcutsHelpHotkey()` once (typically in App.vue onMounted)
 * to attach the global "?" keydown listener. Uses a ref-count so the listener
 * is added exactly once regardless of how many callers install it, and is
 * removed when the last caller unmounts.
 */

import { ref } from 'vue'

// ---------------------------------------------------------------------------
// Shared open/close state — one source of truth for all callers
// ---------------------------------------------------------------------------

const isOpen = ref(false)

// ---------------------------------------------------------------------------
// Composable — returns reactive state and open/close/toggle helpers
// ---------------------------------------------------------------------------

export function useKeyboardShortcutsHelp() {
  return {
    isOpen,
    open: () => {
      isOpen.value = true
    },
    close: () => {
      isOpen.value = false
    },
    toggle: () => {
      isOpen.value = !isOpen.value
    },
  }
}

// ---------------------------------------------------------------------------
// Global hotkey — ref-counted, single listener
// ---------------------------------------------------------------------------

let _installCount = 0

function isEditableTarget(target: EventTarget | null): boolean {
  if (!target) return false
  const el = target as HTMLElement
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (el.isContentEditable) return true
  return false
}

function onGlobalKeydown(event: KeyboardEvent): void {
  // Close on Esc when panel is open
  if (event.key === 'Escape') {
    if (isOpen.value) {
      isOpen.value = false
      event.stopPropagation()
    }
    return
  }

  // Open on '?' (Shift+/) outside editable elements
  if (event.key === '?' && !isEditableTarget(event.target)) {
    event.preventDefault()
    isOpen.value = true
  }
}

/**
 * Attach the global "?" hotkey listener. Safe to call multiple times —
 * the DOM listener is added only once.
 *
 * Returns an uninstall function that decrements the ref-count and removes
 * the listener when the count reaches zero. Prefer calling this inside
 * `onUnmounted` when used from a component.
 */
export function installShortcutsHelpHotkey(): () => void {
  _installCount++
  if (_installCount === 1) {
    document.addEventListener('keydown', onGlobalKeydown)
  }

  return function uninstall() {
    _installCount--
    if (_installCount <= 0) {
      document.removeEventListener('keydown', onGlobalKeydown)
      _installCount = 0
    }
  }
}
