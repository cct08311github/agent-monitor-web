const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export interface FocusTrap {
  /** Store current focus, move into container, trap Tab, listen for Escape. */
  activate(container: HTMLElement, onEscape?: () => void): void
  /** Remove listener, restore focus to element that was focused before activate. */
  deactivate(): void
}

/**
 * Create a focus trap. Use one instance per modal. Each `activate` call
 * supersedes any previous activation (auto-deactivates first).
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
      // If already active, tear down previous state first
      if (keydownHandler !== null) {
        document.removeEventListener('keydown', keydownHandler)
      }

      previousActiveElement = document.activeElement
      currentContainer = container
      currentOnEscape = onEscape
      keydownHandler = handleKeyDown
      document.addEventListener('keydown', keydownHandler)

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
