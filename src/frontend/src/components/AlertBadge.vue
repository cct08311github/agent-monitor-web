<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { api } from '@/composables/useApi'
import { appState } from '@/stores/appState'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AlertRecord {
  rule: string
  severity: 'critical' | 'warning'
  message: string
  meta: Record<string, unknown>
  ts: number
}

interface AlertsRecentResponse {
  success: boolean
  data: {
    alerts: AlertRecord[]
  }
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const alerts = ref<AlertRecord[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const flashing = ref(false)

let interval: ReturnType<typeof setInterval> | null = null
let flashTimeout: ReturnType<typeof setTimeout> | null = null

// ---------------------------------------------------------------------------
// Computed
// ---------------------------------------------------------------------------

const FIVE_MINUTES_MS = 5 * 60 * 1000

const recentAlerts = computed(() => {
  const cutoff = Date.now() - FIVE_MINUTES_MS
  return alerts.value.filter((a) => a.ts >= cutoff)
})

const criticalCount = computed(() =>
  recentAlerts.value.filter((a) => a.severity === 'critical').length,
)

const warningCount = computed(() =>
  recentAlerts.value.filter((a) => a.severity === 'warning').length,
)

const severity = computed<'critical' | 'warning' | 'none'>(() => {
  if (criticalCount.value > 0) return 'critical'
  if (warningCount.value > 0) return 'warning'
  return 'none'
})

const badgeCount = computed(() => {
  if (criticalCount.value > 0) return criticalCount.value
  return warningCount.value
})

const ariaLabel = computed(() => {
  if (badgeCount.value === 0) return '無 alert'
  return `${badgeCount.value} 個 ${severity.value} alert`
})

// ---------------------------------------------------------------------------
// Polling
// ---------------------------------------------------------------------------

async function fetchAlerts(): Promise<void> {
  try {
    loading.value = true
    error.value = null
    const res = (await api.get('/api/alerts/recent?limit=10')) as AlertsRecentResponse
    if (res.success && Array.isArray(res.data?.alerts)) {
      alerts.value = res.data.alerts
    }
  } catch {
    // Silent fail — badge should not block the rest of the UI
    error.value = null
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void fetchAlerts()
  interval = setInterval(() => {
    void fetchAlerts()
  }, 30_000)
})

onUnmounted(() => {
  if (interval !== null) {
    clearInterval(interval)
    interval = null
  }
  if (flashTimeout !== null) {
    clearTimeout(flashTimeout)
    flashTimeout = null
  }
})

// ---------------------------------------------------------------------------
// Flash on new alerts
// ---------------------------------------------------------------------------

watch(badgeCount, (newCount, oldCount) => {
  // Only flash when count grows from 0 → N or increases
  if (newCount > 0 && newCount > oldCount) {
    flashing.value = true
    if (flashTimeout !== null) clearTimeout(flashTimeout)
    flashTimeout = setTimeout(() => {
      flashing.value = false
      flashTimeout = null
    }, 2000)
  }
})

// ---------------------------------------------------------------------------
// Click handler
// ---------------------------------------------------------------------------

function handleClick(): void {
  appState.currentDesktopTab = 'monitor'
  appState.preferredMonitorSubTab = 'observability'
}
</script>

<template>
  <button
    class="header-btn icon-only alert-badge-btn"
    :class="{ flashing }"
    :aria-label="ariaLabel"
    role="status"
    aria-live="polite"
    :title="ariaLabel"
    @click="handleClick"
  >
    <span class="bell-icon" aria-hidden="true">🔔</span>
    <span
      v-if="badgeCount > 0"
      :class="['alert-badge', severity]"
      aria-hidden="true"
    >{{ badgeCount }}</span>
  </button>
</template>

<style scoped>
.alert-badge-btn {
  position: relative;
}

.bell-icon {
  font-size: 16px;
  line-height: 1;
}

.alert-badge {
  position: absolute;
  top: 2px;
  right: 2px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 8px;
  font-size: 10px;
  font-weight: 700;
  line-height: 16px;
  text-align: center;
  pointer-events: none;
}

.alert-badge.critical {
  background-color: #ef4444;
  color: #fff;
}

.alert-badge.warning {
  background-color: #f59e0b;
  color: #fff;
}

@keyframes flash {
  0%   { opacity: 1; }
  25%  { opacity: 0.3; }
  50%  { opacity: 1; }
  75%  { opacity: 0.3; }
  100% { opacity: 1; }
}

.flashing {
  animation: flash 0.6s ease-in-out 3;
}
</style>
