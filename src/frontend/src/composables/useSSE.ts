// ---------------------------------------------------------------------------
// useSSE — EventSource wrapper ported from stream-manager.js
//
// Features:
//   - Exponential back-off with ±20% jitter (BASE=1 s, MAX=15 s)
//   - Page Visibility API: pause when tab hidden, resume when visible
//   - Auto-reconnect with attempt counter (max MAX_RECONNECT_ATTEMPTS)
//   - Enters terminal 'failed' state after max attempts; manualReconnect() to retry
//   - Cleans up on component unmount via onUnmounted
//   - Prefixes URLs with the basePath from useApi
// ---------------------------------------------------------------------------

import { ref, onUnmounted } from 'vue'
import { getBasePath } from '@/composables/useApi'

const BASE_DELAY = 1000
const MAX_DELAY = 15_000
const JITTER_FACTOR = 0.2
const MAX_RECONNECT_ATTEMPTS = 10

function backoffDelay(attempt: number): number {
  const delay = Math.min(BASE_DELAY * Math.pow(2, attempt), MAX_DELAY)
  const jitter = delay * JITTER_FACTOR * (Math.random() * 2 - 1)
  return Math.round(delay + jitter)
}

// ---------------------------------------------------------------------------
// Public option types
// ---------------------------------------------------------------------------

export interface SSEOptions {
  /** Fire when the connection opens (or re-opens). `attempt` resets to 0. */
  onOpen?: (source: EventSource) => void
  /** Fire for every unnamed `message` event. */
  onMessage?: (event: MessageEvent, source: EventSource) => void
  /** Fire on connection error. */
  onError?: (event: Event, source: EventSource) => void
  /** Fire just before a reconnect attempt. */
  onReconnecting?: (attempt: number, delayMs: number) => void
  /** Fire when the tab becomes visible again after being paused. */
  onResumed?: () => void
  /** Named event listeners (e.g. `{ dashboard: handler }`). */
  events?: Record<string, (event: MessageEvent, source: EventSource) => void>
  /** Enable automatic reconnection (default: true). */
  autoReconnect?: boolean
}

export interface SSEHandle {
  /** Open (or re-open) the SSE connection to `url`. */
  connect: (url: string, options?: SSEOptions) => void
  /** Permanently close the connection and remove all listeners. */
  close: () => void
  /** Whether the EventSource is currently open. */
  isConnected: import('vue').Ref<boolean>
  /** Current reconnect-attempt counter (resets to 0 on successful open). */
  reconnectAttempt: import('vue').Ref<number>
  /** True when reconnect attempts have been exhausted (terminal state). */
  isFailed: import('vue').Ref<boolean>
  /** Reset the failure state and attempt to connect again from scratch. */
  manualReconnect: () => void
}

// ---------------------------------------------------------------------------
// Composable
// ---------------------------------------------------------------------------

export function useSSE(): SSEHandle {
  const isConnected = ref(false)
  const reconnectAttempt = ref(0)
  const isFailed = ref(false)

  let source: EventSource | null = null
  let closed = false
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let pausedByVisibility = false
  let visibilityHandler: (() => void) | null = null
  let _currentUrl = ''
  let _currentOptions: SSEOptions = {}

  // ---- Internal helpers ---------------------------------------------------

  function clearReconnect(): void {
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
  }

  function closeSource(): void {
    if (source) {
      try {
        source.close()
      } catch {
        // Ignore
      }
      source = null
      isConnected.value = false
    }
  }

  function scheduleReconnect(): void {
    if (closed || _currentOptions.autoReconnect === false) return
    if (reconnectAttempt.value >= MAX_RECONNECT_ATTEMPTS) {
      isFailed.value = true
      return
    }
    clearReconnect()
    const delay = backoffDelay(reconnectAttempt.value)
    reconnectAttempt.value++
    _currentOptions.onReconnecting?.(reconnectAttempt.value, delay)
    reconnectTimer = setTimeout(start, delay)
  }

  function start(): void {
    if (closed) return
    closeSource()

    const basePath = getBasePath()
    const fullUrl =
      basePath && _currentUrl.startsWith('/') ? basePath + _currentUrl : _currentUrl

    source = new EventSource(fullUrl)

    source.onopen = () => {
      reconnectAttempt.value = 0
      isFailed.value = false
      isConnected.value = true
      _currentOptions.onOpen?.(source!)
    }

    if (_currentOptions.onMessage) {
      const handler = _currentOptions.onMessage
      source.onmessage = (event: MessageEvent) => handler(event, source!)
    }

    if (_currentOptions.events) {
      for (const [eventName, handler] of Object.entries(_currentOptions.events)) {
        source.addEventListener(eventName, ((event: MessageEvent) => {
          handler(event, source!)
        }) as EventListener)
      }
    }

    source.onerror = (event: Event) => {
      isConnected.value = false
      _currentOptions.onError?.(event, source!)
      if (_currentOptions.autoReconnect !== false) {
        closeSource()
        scheduleReconnect()
      }
    }
  }

  function removeVisibilityListener(): void {
    if (visibilityHandler) {
      document.removeEventListener('visibilitychange', visibilityHandler)
      visibilityHandler = null
    }
  }

  // ---- Public API ---------------------------------------------------------

  function connect(url: string, options: SSEOptions = {}): void {
    // Clean up any existing connection first
    closed = false
    pausedByVisibility = false
    _currentUrl = url
    _currentOptions = options

    removeVisibilityListener()

    // Page Visibility API integration
    if (typeof document !== 'undefined' && options.autoReconnect !== false) {
      visibilityHandler = () => {
        if (document.hidden) {
          if (source && source.readyState !== EventSource.CLOSED) {
            pausedByVisibility = true
            closeSource()
            clearReconnect()
          }
        } else if (pausedByVisibility && !closed) {
          pausedByVisibility = false
          reconnectAttempt.value = 0
          start()
          _currentOptions.onResumed?.()
        }
      }
      document.addEventListener('visibilitychange', visibilityHandler)
    }

    start()
  }

  function close(): void {
    closed = true
    clearReconnect()
    closeSource()
    removeVisibilityListener()
  }

  /** Reset failure state and attempt reconnection from the beginning. */
  function manualReconnect(): void {
    isFailed.value = false
    reconnectAttempt.value = 0
    closed = false
    clearReconnect()
    start()
  }

  // Auto-cleanup when the owning component unmounts
  onUnmounted(() => {
    close()
  })

  return { connect, close, isConnected, reconnectAttempt, isFailed, manualReconnect }
}
