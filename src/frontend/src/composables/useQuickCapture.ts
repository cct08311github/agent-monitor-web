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

import { ref, computed } from 'vue'
import {
  loadCaptures,
  addCapture as addUtil,
  deleteCapture as delUtil,
  clearCaptures as clearUtil,
  updateCapture as updateCaptureUtil,
  type Capture,
} from '@/utils/quickCapture'
import {
  loadArchived,
  archiveCapture as archiveUtil,
  unarchiveCapture as unarchiveUtil,
} from '@/utils/captureArchive'
import {
  loadPins,
  togglePin as togglePinUtil,
  isPinned as isPinnedUtil,
} from '@/utils/capturePins'

// ---------------------------------------------------------------------------
// Module-scoped shared state
// ---------------------------------------------------------------------------

const isOpen = ref(false)
const isListOpen = ref(false)
const captures = ref<Capture[]>(loadCaptures())
const archivedIds = ref<Set<string>>(loadArchived())
const pinnedIds = ref<string[]>(loadPins())

/**
 * Body text to pre-fill the QuickCaptureModal when opened via clone.
 * Empty string means no pre-fill (normal open).
 */
const prefillBody = ref<string>('')

/**
 * Date key (YYYY-MM-DD) to jump to when the list next opens.
 * QuickCaptureList watches this and scrolls to the target day section.
 * Reset to null after the jump is consumed.
 */
const pendingJumpDate = ref<string | null>(null)

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

/** Active (non-archived) captures. */
const activeCaptures = computed(() =>
  captures.value.filter((c) => !archivedIds.value.has(c.id)),
)

/** Archived captures (preserved but hidden from main list). */
const archivedCaptures = computed(() =>
  captures.value.filter((c) => archivedIds.value.has(c.id)),
)

export function useQuickCapture() {
  return {
    isOpen,
    isListOpen,
    captures,
    archivedIds,
    pinnedIds,
    activeCaptures,
    archivedCaptures,
    prefillBody,
    pendingJumpDate,
    open: () => {
      isOpen.value = true
    },
    /** Open the modal with a pre-filled body (for clone). */
    openWithPrefill: (body: string): void => {
      prefillBody.value = body
      isOpen.value = true
    },
    close: () => {
      isOpen.value = false
      prefillBody.value = ''
    },
    openList: () => {
      refreshFromStorage()
      isListOpen.value = true
    },
    /** Open the captures list and immediately jump to the given date. */
    openListWithJump: (dateKey: string): void => {
      pendingJumpDate.value = dateKey
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
      // Also clean up archived state so orphan ids don't accumulate
      if (archivedIds.value.has(id)) {
        const next = new Set(archivedIds.value)
        next.delete(id)
        archivedIds.value = next
      }
    },
    archive: (id: string): void => {
      archivedIds.value = archiveUtil(id)
    },
    unarchive: (id: string): void => {
      archivedIds.value = unarchiveUtil(id)
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
    togglePin: (id: string): void => {
      pinnedIds.value = togglePinUtil(id)
    },
    isPinned: (id: string): boolean => isPinnedUtil(pinnedIds.value, id),
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
