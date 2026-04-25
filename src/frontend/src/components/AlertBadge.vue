<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { api } from '@/composables/useApi'
import { appState } from '@/stores/appState'
import { formatRelativeTime } from '@/lib/time'
import { showToast } from '@/composables/useToast'
import NumberTicker from './NumberTicker.vue'

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

// ---------------------------------------------------------------------------
// Alert cleared celebration state
// ---------------------------------------------------------------------------

const celebratingClear = ref(false)
let celebrateTimeout: ReturnType<typeof setTimeout> | null = null

// Popover state
const showPopover = ref(false)
let showTimer: ReturnType<typeof setTimeout> | null = null
let hideTimer: ReturnType<typeof setTimeout> | null = null

let interval: ReturnType<typeof setInterval> | null = null
let flashTimeout: ReturnType<typeof setTimeout> | null = null

// ---------------------------------------------------------------------------
// Desktop Notification state
// ---------------------------------------------------------------------------

const NOTIF_STORAGE_KEY = 'oc_desktop_notif_enabled'

// ---------------------------------------------------------------------------
// Audio cue state
// ---------------------------------------------------------------------------

const AUDIO_KEY = 'oc_alert_audio_enabled'

const audioEnabled = ref<boolean>(false)
let audioCtx: AudioContext | null = null

// ---------------------------------------------------------------------------
// Snooze state
// ---------------------------------------------------------------------------

const SNOOZE_KEY = 'oc_alert_notif_snooze_until'

/** epoch ms at which snooze expires, or null if not snoozed */
const snoozeUntil = ref<number | null>(null)

/** ticks every second so computed snooze display stays fresh */
const now = ref<number>(Date.now())
let nowInterval: ReturnType<typeof setInterval> | null = null

// SSR-safe Notification availability
const notifSupported = typeof Notification !== 'undefined'

const notificationsEnabled = ref<boolean>(false)
const notificationPermission = ref<NotificationPermission>('default')
/** IDs of critical alerts that have already triggered a desktop notification */
const lastCriticalIds = ref<Set<string>>(new Set())

// ---------------------------------------------------------------------------
// Computed
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Snooze computed
// ---------------------------------------------------------------------------

const isSnoozed = computed<boolean>(() => snoozeUntil.value !== null && snoozeUntil.value > now.value)

const snoozeRemainingMs = computed<number>(() => {
  if (snoozeUntil.value === null) return 0
  return Math.max(0, snoozeUntil.value - now.value)
})

const snoozeRemainingMinutes = computed<number>(() => Math.ceil(snoozeRemainingMs.value / 60_000))

// ---------------------------------------------------------------------------
// Snooze methods
// ---------------------------------------------------------------------------

function setSnooze(minutes: number): void {
  snoozeUntil.value = now.value + minutes * 60_000
  persistSnooze()
}

function cancelSnooze(): void {
  snoozeUntil.value = null
  try {
    localStorage.removeItem(SNOOZE_KEY)
  } catch {
    // localStorage may be unavailable; ignore silently
  }
}

function persistSnooze(): void {
  try {
    if (snoozeUntil.value !== null && snoozeUntil.value > Date.now()) {
      localStorage.setItem(SNOOZE_KEY, String(snoozeUntil.value))
    } else {
      localStorage.removeItem(SNOOZE_KEY)
    }
  } catch {
    // localStorage may be unavailable; ignore silently
  }
}

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

/** Build a stable dedup id for a critical alert */
function criticalAlertId(a: AlertRecord): string {
  return `${a.rule}:${a.ts}`
}

// ---------------------------------------------------------------------------
// Desktop Notification methods
// ---------------------------------------------------------------------------

async function requestNotificationPermission(): Promise<void> {
  if (!notifSupported) return
  const result = await Notification.requestPermission()
  notificationPermission.value = result
}

async function toggleNotifications(): Promise<void> {
  const nextEnabled = !notificationsEnabled.value
  if (nextEnabled && notificationPermission.value !== 'granted') {
    await requestNotificationPermission()
  }
  notificationsEnabled.value = nextEnabled
  try {
    localStorage.setItem(NOTIF_STORAGE_KEY, nextEnabled ? '1' : '0')
  } catch {
    // localStorage may be unavailable in some contexts; ignore silently
  }
}

// ---------------------------------------------------------------------------
// Audio cue methods
// ---------------------------------------------------------------------------

function toggleAudio(): void {
  audioEnabled.value = !audioEnabled.value
  try {
    localStorage.setItem(AUDIO_KEY, audioEnabled.value ? '1' : '0')
  } catch {
    // localStorage may be unavailable; ignore silently
  }
}

function playBeep(): void {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    }
    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.connect(gain)
    gain.connect(audioCtx.destination)
    osc.frequency.value = 880 // A5
    gain.gain.setValueAtTime(0.0001, audioCtx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.3, audioCtx.currentTime + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.25)
    osc.start()
    osc.stop(audioCtx.currentTime + 0.25)
  } catch {
    // Silent — audio failure must never break UX
  }
}

// ---------------------------------------------------------------------------
// Watch recentAlerts → fire desktop notifications for new criticals
// ---------------------------------------------------------------------------

watch(recentAlerts, (current) => {
  const currentCriticals = current.filter((a) => a.severity === 'critical')

  const newCriticals = currentCriticals.filter(
    (a) => !lastCriticalIds.value.has(criticalAlertId(a)),
  )

  // Always track newly seen critical ids (even when notifications are off)
  // so we don't fire for stale alerts if the user later enables notifications.
  for (const a of currentCriticals) {
    lastCriticalIds.value.add(criticalAlertId(a))
  }

  if (newCriticals.length > 0 && !isSnoozed.value) {
    // Desktop notification
    if (
      notificationsEnabled.value &&
      notificationPermission.value === 'granted' &&
      notifSupported
    ) {
      // Batch: fire a single notification for the entire set of new criticals
      const body =
        newCriticals.length === 1
          ? truncate(newCriticals[0].message)
          : `${newCriticals.length} 個 critical alerts`

      // Use the first new critical's rule as the notification tag so rapid-fire
      // updates replace (rather than stack) the same logical alert
      const tag = newCriticals.length === 1 ? newCriticals[0].rule : 'agent-monitor-critical'

      new Notification('Agent Monitor — Critical Alert', {
        body,
        tag,
        requireInteraction: false,
      })
    }

    // Audio cue
    if (audioEnabled.value) {
      playBeep()
    }
  }
})

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
  // Load persisted notification preference
  if (notifSupported) {
    notificationPermission.value = Notification.permission
    try {
      const stored = localStorage.getItem(NOTIF_STORAGE_KEY)
      if (stored !== null) {
        notificationsEnabled.value = stored === '1'
      }
    } catch {
      // localStorage may be unavailable; default to false
    }
  }

  // Load persisted audio cue preference
  try {
    const storedAudio = localStorage.getItem(AUDIO_KEY)
    if (storedAudio !== null) {
      audioEnabled.value = storedAudio === '1'
    }
  } catch {
    // localStorage may be unavailable; default to false
  }

  // Load persisted snooze
  try {
    const storedSnooze = localStorage.getItem(SNOOZE_KEY)
    if (storedSnooze !== null) {
      const parsed = parseInt(storedSnooze, 10)
      if (!isNaN(parsed) && parsed > Date.now()) {
        snoozeUntil.value = parsed
      } else {
        // Expired — clean up
        localStorage.removeItem(SNOOZE_KEY)
      }
    }
  } catch {
    // localStorage may be unavailable; ignore silently
  }

  // Tick every second so snooze countdown stays live
  nowInterval = setInterval(() => {
    now.value = Date.now()
    // Auto-clear expired snooze
    if (snoozeUntil.value !== null && snoozeUntil.value <= now.value) {
      cancelSnooze()
    }
  }, 1_000)

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
  if (nowInterval !== null) {
    clearInterval(nowInterval)
    nowInterval = null
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
  if (celebrateTimeout !== null) {
    clearTimeout(celebrateTimeout)
    celebrateTimeout = null
  }
})

// ---------------------------------------------------------------------------
// Alert cleared celebration helpers
// ---------------------------------------------------------------------------

/** Random horizontal position + staggered fall delay for each confetti emoji */
function celebrationStyle(i: number): Record<string, string> {
  // Use index-based determinism so SSR-safe (no Math.random in render)
  const left = ((i * 137.508) % 100).toFixed(2) // golden-angle spread
  const delay = ((i % 4) * 0.18).toFixed(2)
  return {
    left: `${left}%`,
    animationDelay: `${delay}s`,
  }
}

// ---------------------------------------------------------------------------
// Watch recentAlerts → trigger celebration when count transitions to 0
// ---------------------------------------------------------------------------

watch(
  () => recentAlerts.value.length,
  (current, previous) => {
    if (previous !== undefined && previous > 0 && current === 0) {
      celebratingClear.value = true
      showToast('🎉 All alerts cleared!', 'success')
      if (celebrateTimeout !== null) clearTimeout(celebrateTimeout)
      celebrateTimeout = setTimeout(() => {
        celebratingClear.value = false
        celebrateTimeout = null
      }, 3000)
    }
  },
)

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
      ><NumberTicker :value="badgeCount" /></span>
    </button>

    <Transition name="fade">
      <div
        v-if="showPopover"
        class="popover"
        role="tooltip"
        aria-label="Recent alerts"
      >
        <div class="popover-header">
          <span v-if="isSnoozed" class="snooze-status">
            ⏸ 靜音中（剩 {{ snoozeRemainingMinutes }} 分鐘）
            <button class="snooze-cancel-btn" @click="cancelSnooze">取消</button>
          </span>
          <span v-else>{{ topAlerts.length > 0 ? '最近 Alerts' : '目前無 alert' }}</span>
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

        <!-- Desktop notification settings row -->
        <div class="popover-notif-settings">
          <label
            class="notif-toggle-label"
            :class="{ 'notif-toggle-disabled': !notifSupported }"
          >
            <input
              type="checkbox"
              class="notif-toggle-checkbox"
              :checked="notificationsEnabled"
              :disabled="!notifSupported || notificationPermission === 'denied'"
              @change="toggleNotifications"
            />
            <span class="notif-toggle-text">啟用桌面通知</span>
          </label>

          <!-- Audio cue settings row -->
          <label class="notif-toggle-label audio-toggle-label">
            <input
              type="checkbox"
              class="notif-toggle-checkbox audio-toggle-checkbox"
              :checked="audioEnabled"
              @change="toggleAudio"
            />
            <span class="notif-toggle-text">啟用 critical 音效</span>
          </label>

          <!-- Browser not supported -->
          <p
            v-if="!notifSupported"
            class="notif-warning"
            role="alert"
          >
            瀏覽器不支援通知
          </p>

          <!-- Permission denied -->
          <p
            v-else-if="notificationPermission === 'denied'"
            class="notif-warning notif-warning--blocked"
            role="alert"
          >
            已封鎖通知，請到瀏覽器設定允許
          </p>
        </div>

        <!-- Snooze row — only shown when notifications are enabled and not already snoozed -->
        <div v-if="notificationsEnabled && !isSnoozed" class="popover-snooze-row">
          <span class="snooze-label">靜音：</span>
          <button class="snooze-btn" @click="setSnooze(30)">30 分</button>
          <button class="snooze-btn" @click="setSnooze(60)">1 小時</button>
          <button class="snooze-btn" @click="setSnooze(120)">2 小時</button>
        </div>
      </div>
    </Transition>
  </div>

  <!-- Alert cleared celebration overlay — full-screen confetti rain, 3 s -->
  <Teleport to="body">
    <div v-if="celebratingClear" class="alert-celebrate-overlay" aria-hidden="true">
      <span
        v-for="i in 8"
        :key="i"
        class="alert-celebrate-emoji"
        :style="celebrationStyle(i)"
      >🎉</span>
    </div>
  </Teleport>
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

/* ── Desktop Notification settings row ─────────────────────────────────── */

.popover-notif-settings {
  padding: 8px 14px 10px;
  border-top: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.08));
}

.notif-toggle-label {
  display: flex;
  align-items: center;
  gap: 7px;
  cursor: pointer;
  user-select: none;
}

.notif-toggle-label.notif-toggle-disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.notif-toggle-checkbox {
  width: 13px;
  height: 13px;
  cursor: inherit;
  accent-color: var(--color-accent, #60a5fa);
}

.notif-toggle-text {
  font-size: 11px;
  color: var(--text-secondary, rgba(255, 255, 255, 0.65));
}

.audio-toggle-label {
  margin-top: 6px;
}

.notif-warning {
  margin: 5px 0 0;
  font-size: 10px;
  line-height: 1.4;
  color: var(--text-muted, rgba(255, 255, 255, 0.4));
}

.notif-warning--blocked {
  color: #f87171;
}

/* ── Snooze status (popover header) ─────────────────────────────────────── */

.snooze-status {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-secondary, rgba(255, 255, 255, 0.65));
}

.snooze-cancel-btn {
  background: none;
  border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.2));
  border-radius: 4px;
  padding: 2px 7px;
  font-size: 10px;
  font-weight: 500;
  color: var(--color-accent, #60a5fa);
  cursor: pointer;
  transition: opacity 150ms ease;
}

.snooze-cancel-btn:hover {
  opacity: 0.75;
}

/* ── Snooze buttons row ──────────────────────────────────────────────────── */

.popover-snooze-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px 10px;
  border-top: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.08));
}

.snooze-label {
  font-size: 11px;
  color: var(--text-muted, rgba(255, 255, 255, 0.4));
  flex-shrink: 0;
}

.snooze-btn {
  background: none;
  border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.15));
  border-radius: 4px;
  padding: 3px 8px;
  font-size: 10px;
  font-weight: 500;
  color: var(--text-secondary, rgba(255, 255, 255, 0.6));
  cursor: pointer;
  transition: border-color 150ms ease, color 150ms ease;
}

.snooze-btn:hover {
  border-color: var(--color-accent, #60a5fa);
  color: var(--color-accent, #60a5fa);
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

/* ── Alert cleared celebration overlay ────────────────────────────────────── */

.alert-celebrate-overlay {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 9999;
  overflow: hidden;
}

@keyframes celebrationFall {
  0% {
    transform: translateY(-60px) rotate(0deg);
    opacity: 1;
  }
  80% {
    opacity: 1;
  }
  100% {
    transform: translateY(100vh) rotate(360deg);
    opacity: 0;
  }
}

.alert-celebrate-emoji {
  position: absolute;
  top: 0;
  font-size: 28px;
  line-height: 1;
  animation: celebrationFall 2.8s ease-in forwards;
  /* horizontal + delay set inline via celebrationStyle() */
}
</style>
