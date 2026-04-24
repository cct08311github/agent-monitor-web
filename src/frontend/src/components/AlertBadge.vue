<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { api } from '@/composables/useApi'
import { appState } from '@/stores/appState'
import { formatRelativeTime } from '@/lib/time'

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

// Popover state
const showPopover = ref(false)
let showTimer: ReturnType<typeof setTimeout> | null = null
let hideTimer: ReturnType<typeof setTimeout> | null = null

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

/** Top 3 alerts from recentAlerts sorted by ts desc (newest first) */
const topAlerts = computed(() => {
  return [...recentAlerts.value].sort((a, b) => b.ts - a.ts).slice(0, 3)
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncate(s: string, n = 80): string {
  if (s.length <= n) return s
  return s.slice(0, n) + '…'
}

// ---------------------------------------------------------------------------
// Popover interaction
// ---------------------------------------------------------------------------

function onMouseEnter(): void {
  if (hideTimer !== null) {
    clearTimeout(hideTimer)
    hideTimer = null
  }
  showTimer = setTimeout(() => {
    showPopover.value = true
    showTimer = null
  }, 200)
}

function onMouseLeave(): void {
  if (showTimer !== null) {
    clearTimeout(showTimer)
    showTimer = null
  }
  hideTimer = setTimeout(() => {
    showPopover.value = false
    hideTimer = null
  }, 300)
}

function onFocus(): void {
  if (showTimer !== null) {
    clearTimeout(showTimer)
    showTimer = null
  }
  if (hideTimer !== null) {
    clearTimeout(hideTimer)
    hideTimer = null
  }
  showPopover.value = true
}

function onBlur(): void {
  if (showTimer !== null) {
    clearTimeout(showTimer)
    showTimer = null
  }
  if (hideTimer !== null) {
    clearTimeout(hideTimer)
    hideTimer = null
  }
  showPopover.value = false
}

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
  if (showTimer !== null) {
    clearTimeout(showTimer)
    showTimer = null
  }
  if (hideTimer !== null) {
    clearTimeout(hideTimer)
    hideTimer = null
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
  <div
    class="alert-badge-wrapper"
    @mouseenter="onMouseEnter"
    @mouseleave="onMouseLeave"
    @focusin="onFocus"
    @focusout="onBlur"
  >
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

    <Transition name="fade">
      <div
        v-if="showPopover"
        class="popover"
        role="tooltip"
        aria-label="Recent alerts"
      >
        <div class="popover-header">
          {{ topAlerts.length > 0 ? '最近 Alerts' : '目前無 alert' }}
        </div>

        <ul v-if="topAlerts.length > 0" class="popover-list">
          <li
            v-for="alert in topAlerts"
            :key="`${alert.rule}-${alert.ts}`"
            class="popover-item"
          >
            <span :class="['popover-severity', alert.severity]">
              {{ alert.severity === 'critical' ? 'CRIT' : 'WARN' }}
            </span>
            <div class="popover-body">
              <strong class="popover-rule">{{ alert.rule }}</strong>
              <div class="popover-msg">{{ truncate(alert.message) }}</div>
              <time class="popover-time" :datetime="new Date(alert.ts).toISOString()">
                {{ formatRelativeTime(alert.ts) }}
              </time>
            </div>
          </li>
        </ul>

        <div class="popover-footer">
          <button class="popover-more" @click="handleClick">顯示更多 →</button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* Wrapper: establishes positioning context for absolute popover */
.alert-badge-wrapper {
  position: relative;
  display: inline-flex;
}

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

/* ── Popover ────────────────────────────────────────────────────────────── */

.popover {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 100;
  min-width: 320px;
  max-width: 420px;
  background: var(--bg-card, #1e1e2e);
  border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.1));
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  overflow: hidden;
}

.popover-header {
  padding: 10px 14px 8px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-muted, rgba(255, 255, 255, 0.45));
  border-bottom: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.08));
}

.popover-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.popover-item {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.05));
}

.popover-item:last-child {
  border-bottom: none;
}

.popover-severity {
  flex-shrink: 0;
  margin-top: 2px;
  padding: 2px 5px;
  border-radius: 4px;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.06em;
  line-height: 1.4;
}

.popover-severity.critical {
  background-color: rgba(239, 68, 68, 0.2);
  color: #f87171;
}

.popover-severity.warning {
  background-color: rgba(245, 158, 11, 0.2);
  color: #fbbf24;
}

.popover-body {
  flex: 1;
  min-width: 0;
}

.popover-rule {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary, rgba(255, 255, 255, 0.9));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.popover-msg {
  margin-top: 2px;
  font-size: 11px;
  color: var(--text-secondary, rgba(255, 255, 255, 0.6));
  line-height: 1.4;
  word-break: break-word;
}

.popover-time {
  display: block;
  margin-top: 4px;
  font-size: 10px;
  color: var(--text-muted, rgba(255, 255, 255, 0.35));
}

.popover-footer {
  padding: 8px 14px;
  border-top: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.08));
  text-align: right;
}

.popover-more {
  background: none;
  border: none;
  padding: 4px 0;
  font-size: 11px;
  font-weight: 500;
  color: var(--color-accent, #60a5fa);
  cursor: pointer;
  transition: opacity 150ms ease;
}

.popover-more:hover {
  opacity: 0.75;
}

/* ── Fade transition ────────────────────────────────────────────────────── */

.fade-enter-active,
.fade-leave-active {
  transition: opacity 150ms ease, transform 150ms ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
