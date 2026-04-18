const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export interface FocusTrap {
  /** Store current focus, move into container, trap Tab, listen for Escape. */
  activate(container: HTMLElement, onEscape?: () => void): void
  /** Remove listener, restore focus to element that was focused before activate. */
  deactivate(): void
}

/**
 * Module-level stack tracking currently-active traps (outermost first).
 * Only the topmost trap handles keyboard events — this enables nested modals
 * (e.g., ConfirmDialog opened from TaskDetailModal) without listener pile-up.
 */
const trapStack: FocusTrap[] = []

/**
 * Create a focus trap. Use one instance per modal. Each `activate` call
 * pushes onto the stack; `deactivate` pops. Nested traps coexist safely —
 * only the topmost trap processes Tab / Escape events.
 */
export function createFocusTrap(): FocusTrap {
  let previousActiveElement: Element | null = null
  let currentContainer: HTMLElement | null = null
  let currentOnEscape: (() => void) | undefined
  let keydownHandler: ((e: KeyboardEvent) => void) | null = null

  const getFocusable = (): HTMLElement[] => {
    if (!currentContainer) return []
    return Array.from(currentContainer.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
  }

  const handleKeyDown = (e: KeyboardEvent): void => {
    // Only the topmost trap handles events — nested traps defer to the innermost
    if (trapStack[trapStack.length - 1] !== trap) return

    if (e.key === 'Escape' && currentOnEscape) {
      e.preventDefault()
      currentOnEscape()
      return
    }
    if (e.key !== 'Tab') return

    const focusable = getFocusable()
    if (focusable.length === 0) {
      e.preventDefault()
      return
    }

    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    const active = document.activeElement

    if (e.shiftKey && active === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && active === last) {
      e.preventDefault()
      first.focus()
    }
  }

  const trap: FocusTrap = {
    activate(container, onEscape) {
      // Re-activation of same instance: tear down previous listener first
      if (keydownHandler !== null) {
        document.removeEventListener('keydown', keydownHandler)
        const idx = trapStack.indexOf(trap)
        if (idx !== -1) trapStack.splice(idx, 1)
      }

      previousActiveElement = document.activeElement
      currentContainer = container
      currentOnEscape = onEscape
      keydownHandler = handleKeyDown
      document.addEventListener('keydown', keydownHandler)
      trapStack.push(trap)

      // Move focus into container
      const focusable = getFocusable()
      if (focusable.length > 0) {
        focusable[0].focus()
      } else if (container.tabIndex >= 0) {
        container.focus()
      }
    },
    deactivate() {
      if (keydownHandler !== null) {
        document.removeEventListener('keydown', keydownHandler)
        keydownHandler = null
      }
      const idx = trapStack.indexOf(trap)
      if (idx !== -1) trapStack.splice(idx, 1)
      currentContainer = null
      currentOnEscape = undefined
      if (previousActiveElement instanceof HTMLElement) {
        previousActiveElement.focus()
      }
      previousActiveElement = null
    },
  }

  return trap
}
