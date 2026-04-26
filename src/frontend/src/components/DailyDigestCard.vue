<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import type { DashboardPayload } from '@/types/api'
import { api } from '@/composables/useApi'
import { useToast } from '@/composables/useToast'
import { writeClipboardText, isClipboardWriteSupported } from '@/utils/clipboardWrite'
import { formatDigestForClipboard } from '@/utils/dailyDigestFormat'
import type { DigestData } from '@/utils/dailyDigestFormat'
import { useQuickCapture } from '@/composables/useQuickCapture'

const props = defineProps<{
  dashboard: DashboardPayload | null
}>()

// ---------------------------------------------------------------------------
// Computed values from dashboard
// ---------------------------------------------------------------------------

const activeAgentCount = computed(() =>
  props.dashboard?.agents?.filter(
    (a) => a.status === 'active_executing' || a.status === 'active_recent',
  ).length ?? 0,
)

const enabledCronCount = computed(() =>
  props.dashboard?.cron?.filter((c) => c.enabled).length ?? 0,
)

// ---------------------------------------------------------------------------
// Captures today — counted from useQuickCapture shared state
// ---------------------------------------------------------------------------

const { captures } = useQuickCapture()

const captureCountToday = computed(() => {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const startMs = start.getTime()
  return captures.value.filter((c) => c.createdAt >= startMs).length
})

// ---------------------------------------------------------------------------
// Errors + alerts fetched from API
// ---------------------------------------------------------------------------

const errors24h = ref(0)
const activeAlerts = ref(0)
let _fetchTimer: ReturnType<typeof setInterval> | null = null

async function fetchSummaryStats(): Promise<void> {
  try {
    const [errResp, alertResp] = await Promise.all([
      api.get('/api/read/errors/recent?limit=100') as Promise<{
        success: boolean
        data?: { errors?: unknown[]; total?: number }
        errors?: unknown[]
        total?: number
      }>,
      api.get('/api/alerts/recent?limit=100') as Promise<{
        success: boolean
        data?: { alerts?: unknown[] }
        alerts?: unknown[]
      }>,
    ])

    if (errResp.success) {
      // Support both { data: { errors } } and { errors } shapes
      const errList =
        (errResp.data?.errors ?? errResp.errors) as unknown[] | undefined
      errors24h.value = Array.isArray(errList) ? errList.length : (errResp.data?.total ?? 0)
    }

    if (alertResp.success) {
      const alertList =
        (alertResp.data?.alerts ?? alertResp.alerts) as unknown[] | undefined
      activeAlerts.value = Array.isArray(alertList) ? alertList.length : 0
    }
  } catch {
    // Silently ignore — stats are best-effort in a summary card
  }
}

// ---------------------------------------------------------------------------
// Copy to clipboard
// ---------------------------------------------------------------------------

const toast = useToast()
const clipboardSupported = isClipboardWriteSupported()

async function onCopy(): Promise<void> {
  const data: DigestData = {
    date: new Date(),
    activeAgents: activeAgentCount.value,
    errors24h: errors24h.value,
    activeAlerts: activeAlerts.value,
    enabledCronJobs: enabledCronCount.value,
    captureCountToday: captureCountToday.value,
  }
  const text = formatDigestForClipboard(data)
  const ok = await writeClipboardText(text)
  if (ok) {
    toast.success('已複製當日摘要')
  } else {
    toast.warning('無法寫入剪貼簿')
  }
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

onMounted(() => {
  void fetchSummaryStats()
  // Refresh every 60 s so errors/alerts stay reasonably fresh
  _fetchTimer = setInterval(() => {
    void fetchSummaryStats()
  }, 60_000)
})

onUnmounted(() => {
  if (_fetchTimer !== null) {
    clearInterval(_fetchTimer)
    _fetchTimer = null
  }
})
</script>

<template>
  <div class="digest-card">
    <div class="digest-header">
      <span class="digest-title">📊 當日摘要</span>
      <button
        class="digest-copy-btn"
        :disabled="!clipboardSupported"
        :title="clipboardSupported ? '複製摘要到剪貼簿' : '瀏覽器不支援剪貼簿'"
        aria-label="複製當日摘要"
        @click="onCopy"
      >
        🔗
      </button>
    </div>

    <ul class="digest-list">
      <li class="digest-row">
        <span class="digest-label">✅ Active agents</span>
        <span class="digest-value">{{ activeAgentCount }}</span>
      </li>
      <li class="digest-row">
        <span class="digest-label">⚠️ Errors (last 24h)</span>
        <span class="digest-value">{{ errors24h }}</span>
      </li>
      <li class="digest-row">
        <span class="digest-label">☕ Active alerts</span>
        <span class="digest-value">{{ activeAlerts }}</span>
      </li>
      <li class="digest-row">
        <span class="digest-label">🕒 Cron jobs enabled</span>
        <span class="digest-value">{{ enabledCronCount }}</span>
      </li>
      <li class="digest-row">
        <span class="digest-label">📝 Captures (today)</span>
        <span class="digest-value">{{ captureCountToday }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.digest-card {
  background: var(--color-surface-1, #1e1e1e);
  border: 1px solid var(--color-border, #333);
  border-radius: 8px;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 200px;
}

.digest-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.digest-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text, #e0e0e0);
}

.digest-copy-btn {
  background: var(--color-surface-2, #2a2a2a);
  border: 1px solid var(--color-border, #444);
  border-radius: 5px;
  padding: 3px 7px;
  font-size: 14px;
  cursor: pointer;
  line-height: 1.4;
  color: var(--color-text, #e0e0e0);
  transition: background 0.15s, opacity 0.15s;
}

.digest-copy-btn:not(:disabled):hover {
  background: var(--color-surface-3, #333);
}

.digest-copy-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.digest-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.digest-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
}

.digest-label {
  color: var(--color-text-muted, #999);
  white-space: nowrap;
}

.digest-value {
  color: var(--color-text, #e0e0e0);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
</style>
