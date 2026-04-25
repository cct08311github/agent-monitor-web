// ---------------------------------------------------------------------------
// useDashboard — core data flow composable for the Monitor tab
// Fetches initial dashboard payload and maintains SSE connection
// ---------------------------------------------------------------------------

import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { api, type ApiRequestError } from '@/composables/useApi'
import { useSSE } from '@/composables/useSSE'
import { showToast } from '@/composables/useToast'
import { appState } from '@/stores/appState'
import type { Agent } from '@/types/api'
import { computeFreshness } from '@/lib/freshness'

export type ConnectionStatus = 'connected' | 'disconnected' | 'reconnecting'
export type CostRange = 'today' | 'week' | 'month' | 'all'

export function useDashboard() {
  const router = useRouter()
  const dashboard = computed(() => appState.latestDashboard)
  const connectionStatus = ref<ConnectionStatus>('disconnected')
  const fetchError = ref<string | null>(null)
  const lastUpdateTs = ref(0)

  const now = ref(Date.now())
  let freshnessTicker: ReturnType<typeof setInterval> | null = null

  const dataAge = computed<number | null>(() => {
    if (lastUpdateTs.value === 0) return null
    return Math.max(0, Math.floor((now.value - lastUpdateTs.value) / 1000))
  })

  const freshness = computed(() => computeFreshness(dataAge.value))

  // ── Agent list (sorted by priority) ──────────────────────────────────────

  const agents = computed(() => {
    const raw = dashboard.value?.agents ?? []
    const prio: Record<string, number> = {
      active_executing: 0,
      active_recent: 1,
      dormant: 2,
      inactive: 3,
    }
    return [...raw].sort(
      (a, b) =>
        (prio[a.status] ?? 4) - (prio[b.status] ?? 4) || a.id.localeCompare(b.id),
    )
  })

  const filteredAgents = computed<Agent[]>(() => {
    const q = appState.agentSearchQuery.toLowerCase()
    if (!q) return agents.value
    return agents.value.filter(
      (a) =>
        a.id.toLowerCase().includes(q) ||
        (a.model ?? '').toLowerCase().includes(q) ||
        (a.status ?? '').toLowerCase().includes(q),
    )
  })

  const activeAgents = computed<Agent[]>(() =>
    filteredAgents.value.filter(
      (a) => a.status === 'active_executing' || a.status === 'active_recent',
    ),
  )

  const inactiveAgents = computed<Agent[]>(() =>
    filteredAgents.value.filter(
      (a) => a.status !== 'active_executing' && a.status !== 'active_recent',
    ),
  )

  const subagents = computed(() => {
    const raw = dashboard.value?.subagents ?? []
    const p: Record<string, number> = { running: 0, recent: 1, idle: 2 }
    return [...raw].sort((a, b) => (p[a.status] ?? 3) - (p[b.status] ?? 3))
  })

  // ── Cost helpers ──────────────────────────────────────────────────────────

  const costRange = ref<CostRange>('month')

  function getAgentCost(a: Agent): number {
    const range = costRange.value
    const c = a as unknown as Record<string, unknown>
    const costs = c['costs'] as Record<string, unknown> | undefined
    if (range === 'all') {
      return parseFloat(String(costs?.['total'] ?? c['cost'] ?? 0))
    }
    return parseFloat(String(costs?.[range] ?? c['cost'] ?? 0))
  }

  const totalCost = computed<number>(() =>
    (dashboard.value?.agents ?? []).reduce((sum, a) => sum + getAgentCost(a), 0),
  )

  // ── Initial fetch ─────────────────────────────────────────────────────────

  async function fetchDashboard(force = false): Promise<void> {
    try {
      const url = force
        ? `/api/read/dashboard?force=1&t=${Date.now()}`
        : '/api/read/dashboard'
      const data = await api.get(url)
      const payload = data as typeof appState.latestDashboard
      if (payload?.success) {
        appState.latestDashboard = payload
        const ext = data as Record<string, unknown>
        if (ext['exchangeRate']) {
          appState.currentExchangeRate = ext['exchangeRate'] as number
        }
        lastUpdateTs.value = Date.now()
      }
    } catch (err) {
      const apiErr = err as ApiRequestError
      if (apiErr.status === 401) {
        router.push({ name: 'login' })
        return
      }
      fetchError.value = 'Dashboard 載入失敗'
    }
  }

  // ── SSE connection ────────────────────────────────────────────────────────

  const { connect, close, isConnected, isFailed, manualReconnect } = useSSE()

  // Notify the user when SSE has exhausted all reconnect attempts
  watch(isFailed, (failed) => {
    if (failed) {
      appState.sseStatus = 'disconnected'
      showToast('連線中斷，無法自動重連。請點擊以手動重試。', 'error', {
        duration: 0,
        retryFn: () => {
          manualReconnect()
        },
      })
    }
  })

  // Allow external reconnect requests (e.g. ConnectionStatus dot click)
  watch(
    () => appState.sseReconnectRequest,
    (newVal, oldVal) => {
      if (newVal !== oldVal && newVal > 0) {
        manualReconnect()
      }
    },
  )

  // Track whether we were in a reconnecting state to fire toast only on recovery
  let _wasReconnecting = false

  function startSSE(): void {
    connect('/api/read/stream', {
      onOpen() {
        const wasReconnecting = _wasReconnecting
        _wasReconnecting = false
        connectionStatus.value = 'connected'
        appState.sseStatus = 'connected'
        appState.sseReconnectAttempt = 0
        // Toast only on recovery — not on initial connect
        if (wasReconnecting) {
          showToast('連線已恢復', 'success')
        }
      },
      onMessage(event) {
        try {
          const data = JSON.parse(event.data) as typeof appState.latestDashboard
          if (data?.success) {
            appState.latestDashboard = data
            const ext = data as unknown as Record<string, unknown>
            if (ext['exchangeRate']) {
              appState.currentExchangeRate = ext['exchangeRate'] as number
            }
            lastUpdateTs.value = Date.now()
            connectionStatus.value = 'connected'
            // Update SSE heartbeat fields for the header indicator
            appState.sseLastHeartbeatAt = Date.now()
            appState.sseStatus = 'connected'
            appState.sseReconnectAttempt = 0
          }
        } catch {
          // Ignore parse errors
        }
      },
      onError() {
        connectionStatus.value = 'disconnected'
        appState.sseStatus = 'disconnected'
      },
      onReconnecting(attempt) {
        _wasReconnecting = true
        connectionStatus.value = 'reconnecting'
        appState.sseStatus = 'reconnecting'
        appState.sseReconnectAttempt = attempt
      },
      onResumed() {
        fetchDashboard(true)
      },
      autoReconnect: true,
    })
  }

  onMounted(() => {
    fetchDashboard(true)
    startSSE()
    freshnessTicker = setInterval(() => {
      now.value = Date.now()
    }, 1000)
  })

  onUnmounted(() => {
    close()
    if (freshnessTicker !== null) {
      clearInterval(freshnessTicker)
      freshnessTicker = null
    }
  })

  return {
    dashboard,
    agents,
    filteredAgents,
    activeAgents,
    inactiveAgents,
    subagents,
    connectionStatus,
    fetchError,
    lastUpdateTs,
    isConnected,
    isFailed,
    manualReconnect,
    costRange,
    getAgentCost,
    totalCost,
    fetchDashboard,
    dataAge,
    freshness,
  }
}
