import type { App } from 'vue'
import { showToast } from '@/composables/useToast'

export interface ErrorInfo {
  message: string
  type: string
}

/**
 * Normalize any thrown value into a display-ready message + type label.
 * Handles Error instances, strings, objects with {message,error,reason} shapes,
 * plain objects (JSON stringify, truncated), null, undefined, primitives.
 */
export function formatError(err: unknown): ErrorInfo {
  if (err instanceof Error) {
    return {
      message: err.message || err.name || 'Unknown error',
      type: err.name || 'Error',
    }
  }
  if (typeof err === 'string') {
    return { message: err || 'Empty error', type: 'string' }
  }
  if (err === null) return { message: 'null error', type: 'null' }
  if (err === undefined) return { message: 'undefined error', type: 'undefined' }
  if (typeof err === 'object') {
    const asObj = err as Record<string, unknown>
    const msgField =
      typeof asObj.message === 'string' ? asObj.message
      : typeof asObj.error === 'string' ? asObj.error
      : typeof asObj.reason === 'string' ? asObj.reason
      : null
    if (msgField) {
      return { message: msgField, type: asObj.constructor?.name ?? 'object' }
    }
    try {
      const json = JSON.stringify(err).slice(0, 200)
      return { message: json, type: 'object' }
    } catch {
      return { message: 'Unserializable object', type: 'object' }
    }
  }
  return { message: String(err), type: typeof err }
}

/**
 * Returns true if the same error key was reported within `windowMs` — in that case, the caller should SUPPRESS this report.
 * Otherwise marks this key as seen at `now` and returns false.
 * Caps the map size at 100 entries, pruning stale entries (older than 10× window) when exceeded.
 */
export function shouldSuppressDuplicate(
  key: string,
  now: number,
  windowMs: number,
  recent: Map<string, number>,
): boolean {
  const last = recent.get(key)
  if (last !== undefined && now - last < windowMs) {
    return true
  }
  recent.set(key, now)
  if (recent.size > 100) {
    const staleThreshold = now - windowMs * 10
    for (const [k, t] of recent.entries()) {
      if (t < staleThreshold) recent.delete(k)
    }
  }
  return false
}

const DEDUPE_WINDOW_MS = 1000
const recentErrors = new Map<string, number>()

export function reportError(err: unknown, context: string): void {
  const info = formatError(err)
  const key = `${context}:${info.message}`
  if (shouldSuppressDuplicate(key, Date.now(), DEDUPE_WINDOW_MS, recentErrors)) {
    return
  }
  console.error(`[${context}]`, info.type, info.message, err)
  showToast(`系統錯誤：${info.message}`, 'error')
}

export function installErrorHandlers(app: App): void {
  app.config.errorHandler = (err, _instance, info) => {
    reportError(err, `Vue:${info}`)
  }
  window.addEventListener('error', (event: ErrorEvent) => {
    reportError(event.error ?? event.message, 'window.error')
  })
  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    reportError(event.reason, 'unhandledrejection')
  })
}
