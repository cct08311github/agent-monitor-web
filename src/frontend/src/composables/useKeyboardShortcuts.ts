import { onMounted, onUnmounted } from 'vue'

export interface Shortcut {
  key: string
  ctrl?: boolean
  shift?: boolean
  alt?: boolean
  meta?: boolean
  handler: (event: KeyboardEvent) => void
  description: string
  category?: string
}

const shortcuts: Shortcut[] = []
let _listenerCount = 0

function onKeyDown(event: KeyboardEvent) {
  const tag = (event.target as HTMLElement)?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
    if (event.key !== 'Escape') return
  }

  for (const shortcut of shortcuts) {
    const keyMatch = event.key.toLowerCase() === shortcut.key.toLowerCase()
    const ctrlMatch = !!shortcut.ctrl === event.ctrlKey
    const shiftMatch = !!shortcut.shift === event.shiftKey
    const altMatch = !!shortcut.alt === event.altKey
    const metaMatch = !!shortcut.meta === event.metaKey

    if (keyMatch && ctrlMatch && shiftMatch && altMatch && metaMatch) {
      event.preventDefault()
      shortcut.handler(event)
      break
    }
  }
}

export function registerShortcut(shortcut: Shortcut) {
  shortcuts.push(shortcut)
}

export function unregisterShortcut(handler: Function) {
  for (let i = shortcuts.length - 1; i >= 0; i--) {
    if (shortcuts[i].handler === handler) shortcuts.splice(i, 1)
  }
}

export function useKeyboardShortcuts() {
  const localShortcuts: Shortcut[] = []

  onMounted(() => {
    _listenerCount++
    if (_listenerCount === 1) {
      document.addEventListener('keydown', onKeyDown)
    }
  })

  onUnmounted(() => {
    // Auto-unregister all shortcuts registered by this instance
    for (const s of localShortcuts) {
      const idx = shortcuts.indexOf(s)
      if (idx !== -1) shortcuts.splice(idx, 1)
    }
    localShortcuts.length = 0

    _listenerCount--
    if (_listenerCount <= 0) {
      document.removeEventListener('keydown', onKeyDown)
      _listenerCount = 0
    }
  })

  function scopedRegister(shortcut: Shortcut) {
    shortcuts.push(shortcut)
    localShortcuts.push(shortcut)
  }

  return {
    registerShortcut: scopedRegister,
    unregisterShortcut,
    getShortcuts: () => [...shortcuts],
  }
}
