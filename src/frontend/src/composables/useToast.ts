// ---------------------------------------------------------------------------
// useToast — universal toast notification queue
//
// Module-scoped reactive queue so all callers share state.
//
// Usage:
//   const toast = useToast()
//   toast.success('連線已恢復')
//   toast.error('操作失敗', { duration: 8000 })
//   const id = toast.show({ variant: 'warning', message: '...', duration: 0 })
//   toast.dismiss(id)
//   toast.clear()
// ---------------------------------------------------------------------------

import { ref, readonly } from 'vue'
import type { Ref } from 'vue'

export type ToastVariant = 'success' | 'info' | 'warning' | 'error'

export interface ToastEntry {
  id: string
  variant: ToastVariant
  message: string
  duration: number // ms; 0 = sticky
  actionLabel?: string
  onAction?: () => void
  createdAt: number
}

export interface ToastOptions {
  duration?: number // default 5000; 0 = sticky
  actionLabel?: string
  onAction?: () => void
}

export interface ToastApi {
  show(opts: { variant: ToastVariant; message: string } & ToastOptions): string
  dismiss(id: string): void
  clear(): void
  success(message: string, opts?: ToastOptions): string
  info(message: string, opts?: ToastOptions): string
  warning(message: string, opts?: ToastOptions): string
  error(message: string, opts?: ToastOptions): string
  readonly queue: Readonly<Ref<ReadonlyArray<ToastEntry>>>
}

// ---------------------------------------------------------------------------
// Module-scoped state — shared across all useToast() calls
// ---------------------------------------------------------------------------

const MAX_QUEUE = 5
const DEFAULT_DURATION = 5000

// Internal mutable queue; exposed as readonly from the public API
const _queue = ref<ToastEntry[]>([])

// Map from toast id → active auto-dismiss timer id
const _timers = new Map<string, ReturnType<typeof setTimeout>>()

let _counter = 0

function _genId(): string {
  _counter++
  return `toast-${Date.now()}-${_counter}`
}

// ---------------------------------------------------------------------------
// Core operations
// ---------------------------------------------------------------------------

function show(opts: { variant: ToastVariant; message: string } & ToastOptions): string {
  const id = _genId()
  const duration = opts.duration ?? DEFAULT_DURATION

  const entry: ToastEntry = {
    id,
    variant: opts.variant,
    message: opts.message,
    duration,
    actionLabel: opts.actionLabel,
    onAction: opts.onAction,
    createdAt: Date.now(),
  }

  // Enforce queue cap: drop oldest if needed
  if (_queue.value.length >= MAX_QUEUE) {
    const oldest = _queue.value[0]
    if (oldest) {
      // Clear its timer if pending
      const tid = _timers.get(oldest.id)
      if (tid !== undefined) {
        clearTimeout(tid)
        _timers.delete(oldest.id)
      }
      _queue.value = _queue.value.slice(1)
    }
  }

  _queue.value = [..._queue.value, entry]

  // Schedule auto-dismiss when duration > 0
  if (duration > 0) {
    const timerId = setTimeout(() => {
      _timers.delete(id)
      dismiss(id)
    }, duration)
    _timers.set(id, timerId)
  }

  return id
}

function dismiss(id: string): void {
  // Cancel pending auto-dismiss timer
  const timerId = _timers.get(id)
  if (timerId !== undefined) {
    clearTimeout(timerId)
    _timers.delete(id)
  }
  _queue.value = _queue.value.filter((t) => t.id !== id)
}

function clear(): void {
  // Cancel all pending timers
  _timers.forEach((timerId) => clearTimeout(timerId))
  _timers.clear()
  _queue.value = []
}

// ---------------------------------------------------------------------------
// Variant helpers
// ---------------------------------------------------------------------------

function success(message: string, opts?: ToastOptions): string {
  return show({ variant: 'success', message, ...opts })
}

function info(message: string, opts?: ToastOptions): string {
  return show({ variant: 'info', message, ...opts })
}

function warning(message: string, opts?: ToastOptions): string {
  return show({ variant: 'warning', message, ...opts })
}

function error(message: string, opts?: ToastOptions): string {
  return show({ variant: 'error', message, ...opts })
}

// ---------------------------------------------------------------------------
// Public composable
// ---------------------------------------------------------------------------

const _api: ToastApi = {
  show,
  dismiss,
  clear,
  success,
  info,
  warning,
  error,
  queue: readonly(_queue) as Readonly<Ref<ReadonlyArray<ToastEntry>>>,
}

export function useToast(): ToastApi {
  return _api
}

// ---------------------------------------------------------------------------
// Legacy compat shim — keeps existing callers (App.vue, CronTab.vue, etc.)
// working without changes.
//
//   showToast(message, type, opts?)
//   dismissToast(id) — legacy numeric id, ignored silently if not found
//   dismissAll()
// ---------------------------------------------------------------------------

/** Legacy variant type accepted by older callers */
type LegacyType = 'info' | 'success' | 'warning' | 'error'

/** Default durations used by the legacy API */
const LEGACY_DURATIONS: Record<LegacyType, number> = {
  info: 4000,
  success: 4000,
  warning: 6000,
  error: 0,
}

/**
 * @deprecated Use `useToast().show(...)` or the variant helpers instead.
 */
export function showToast(
  message: string,
  type: LegacyType = 'info',
  opts?: { duration?: number; retryFn?: () => void },
): string {
  const duration = opts?.duration ?? LEGACY_DURATIONS[type] ?? DEFAULT_DURATION
  return show({
    variant: type,
    message,
    duration,
    actionLabel: opts?.retryFn ? '重試' : undefined,
    onAction: opts?.retryFn,
  })
}

/**
 * @deprecated Use `useToast().dismiss(id)` instead.
 */
export function dismissToast(id: string | number): void {
  dismiss(String(id))
}

/**
 * @deprecated Use `useToast().clear()` instead.
 */
export function dismissAll(): void {
  clear()
}
