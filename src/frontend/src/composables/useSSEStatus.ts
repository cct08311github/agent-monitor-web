// ---------------------------------------------------------------------------
// useSSEStatus — tracks SSE connection state for the ConnectionStatus indicator
//
// Designed to be wired into an existing SSE composable (e.g. useDashboard).
// The caller feeds lifecycle events via markConnected / markReconnecting /
// markDisconnected / markHeartbeat; this composable keeps the derived UI state.
//
// Usage:
//   const sseStatus = useSSEStatus(() => myReconnectFn())
//   // In SSE onOpen: sseStatus.markConnected()
//   // In SSE onMessage: sseStatus.markHeartbeat()
//   // In SSE onError: sseStatus.markDisconnected()
//   // In SSE onReconnecting(n): sseStatus.markReconnecting(n)
// ---------------------------------------------------------------------------

import { ref, computed, onUnmounted, type Ref, type ComputedRef } from 'vue'

export type SSEStatus = 'idle' | 'connected' | 'reconnecting' | 'disconnected'

export interface SSEStatusHandle {
  status: Ref<SSEStatus>
  lastHeartbeatAt: Ref<number | null>
  reconnectAttempt: Ref<number>
  isStale: ComputedRef<boolean>
  markConnected(): void
  markReconnecting(attempt: number): void
  markDisconnected(): void
  markHeartbeat(): void
  reconnect(): void
}

export function useSSEStatus(onReconnect: () => void): SSEStatusHandle {
  const status = ref<SSEStatus>('idle')
  const lastHeartbeatAt = ref<number | null>(null)
  const reconnectAttempt = ref(0)

  // Reactive "now" for isStale computation — updated every 1 s
  const _now = ref(Date.now())
  const _ticker = setInterval(() => {
    _now.value = Date.now()
  }, 1000)

  onUnmounted(() => {
    clearInterval(_ticker)
  })

  // isStale: true when no heartbeat has arrived in the last 30 s
  const isStale = computed<boolean>(() => {
    if (lastHeartbeatAt.value === null) return false
    return _now.value - lastHeartbeatAt.value > 30_000
  })

  function markConnected(): void {
    status.value = 'connected'
    reconnectAttempt.value = 0
  }

  function markReconnecting(attempt: number): void {
    status.value = 'reconnecting'
    reconnectAttempt.value = attempt
  }

  function markDisconnected(): void {
    status.value = 'disconnected'
  }

  function markHeartbeat(): void {
    lastHeartbeatAt.value = Date.now()
    status.value = 'connected'
  }

  function reconnect(): void {
    onReconnect()
  }

  return {
    status,
    lastHeartbeatAt,
    reconnectAttempt,
    isStale,
    markConnected,
    markReconnecting,
    markDisconnected,
    markHeartbeat,
    reconnect,
  }
}
