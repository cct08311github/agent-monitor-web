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

export function registerShortcut(shortcut: Shortcut) {
  shortcuts.push(shortcut)
}

export function unregisterShortcut(handler: Function) {
  for (let i = shortcuts.length - 1; i >= 0; i--) {
    if (shortcuts[i].handler === handler) shortcuts.splice(i, 1)
  }
}

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

export function useKeyboardShortcuts() {
  onMounted(() => document.addEventListener('keydown', onKeyDown))
  onUnmounted(() => document.removeEventListener('keydown', onKeyDown))

  return {
    registerShortcut,
    unregisterShortcut,
    getShortcuts: () => [...shortcuts],
  }
}
