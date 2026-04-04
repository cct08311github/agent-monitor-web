import { ref, readonly } from 'vue'

export interface ToastItem {
  id: number
  message: string
  type: 'info' | 'success' | 'warning' | 'error'
  duration: number
  retryFn?: () => void
}

const DURATIONS: Record<string, number> = { info: 4000, success: 4000, warning: 6000, error: 0 }
const ICONS: Record<string, string> = { info: 'ℹ️', success: '✅', warning: '⚠️', error: '❌' }

const toasts = ref<ToastItem[]>([])
let nextId = 0

export function showToast(
  message: string,
  type: 'info' | 'success' | 'warning' | 'error' = 'info',
  opts?: { duration?: number; retryFn?: () => void },
) {
  const id = nextId++
  const duration = opts?.duration ?? DURATIONS[type] ?? 4000
  const item: ToastItem = { id, message, type, duration, retryFn: opts?.retryFn }
  toasts.value.push(item)
  if (duration > 0) {
    setTimeout(() => dismissToast(id), duration)
  }
  return id
}

export function dismissToast(id: number) {
  const idx = toasts.value.findIndex(t => t.id === id)
  if (idx >= 0) toasts.value.splice(idx, 1)
}

export function dismissAll() {
  toasts.value = []
}

export function useToast() {
  return {
    toasts: readonly(toasts),
    showToast,
    dismissToast,
    dismissAll,
    ICONS,
  }
}
