import { onMounted, onUnmounted } from 'vue'

const KONAMI: string[] = [
  'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
  'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight',
  'b', 'a',
]

/**
 * Listen for the Konami code sequence and fire callback when matched.
 * Ignores keys when an INPUT/TEXTAREA/SELECT is focused.
 */
export function useKonamiCode(onMatch: () => void): void {
  let buffer: string[] = []

  const handler = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
    buffer.push(key)
    if (buffer.length > KONAMI.length) buffer = buffer.slice(-KONAMI.length)

    if (buffer.length === KONAMI.length && buffer.every((k, i) => k === KONAMI[i])) {
      buffer = []
      onMatch()
    }
  }

  onMounted(() => document.addEventListener('keydown', handler))
  onUnmounted(() => document.removeEventListener('keydown', handler))
}
