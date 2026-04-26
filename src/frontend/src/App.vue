<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTheme, type ThemeMode } from '@/composables/useTheme'
import { useAuth } from '@/composables/useAuth'
import { useKonamiCode } from '@/composables/useKonamiCode'
import { showToast } from '@/composables/useToast'
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts'
import { useCompactMode } from '@/composables/useCompactMode'
import { usePomodoro } from '@/composables/usePomodoro'
import { useAmbientMode } from '@/composables/useAmbientMode'
import { useVoiceCommand } from '@/composables/useVoiceCommand'
import { parseVoice } from '@/utils/voiceParser'
import { appState } from '@/stores/appState'
import { api } from '@/composables/useApi'
import { formatBadge, shouldShowBadge } from '@/utils/badgeFormat'
import {
  useNotificationBadge,
  installNotificationBadge,
  teardownNotificationBadge,
} from '@/composables/useNotificationBadge'
import { useSoundEffect } from '@/composables/useSoundEffect'
import ToastContainer from '@/components/ToastContainer.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import AlertBadge from '@/components/AlertBadge.vue'
import HeartbeatPulse from '@/components/HeartbeatPulse.vue'
import ConnectionStatus from '@/components/ConnectionStatus.vue'
import KeyboardShortcutsHelp from '@/components/KeyboardShortcutsHelp.vue'
import { installShortcutsHelpHotkey } from '@/composables/useKeyboardShortcutsHelp'
import OnboardingTour from '@/components/OnboardingTour.vue'
import QuietHoursSetting from '@/components/QuietHoursSetting.vue'
import {
  installOnboardingAutoStart,
  teardownOnboardingAutoStart,
} from '@/composables/useOnboardingTour'
import { bootstrapPalette } from '@/composables/useColorPalette'
import { bootstrapDensity } from '@/composables/useDensity'
import {
  installMessageRateTicker,
  teardownMessageRateTicker,
} from '@/composables/useMessageRate'
import MessageRateSparkline from '@/components/MessageRateSparkline.vue'
import WhatsNew from '@/components/WhatsNew.vue'
import {
  installWhatsNewAutoOpen,
  teardownWhatsNewAutoOpen,
} from '@/composables/useWhatsNew'
import WorkspaceProfileMenu from '@/components/WorkspaceProfileMenu.vue'
import QuickCaptureModal from '@/components/QuickCaptureModal.vue'
import QuickCaptureList from '@/components/QuickCaptureList.vue'
import {
  installQuickCaptureHotkey,
  teardownQuickCaptureHotkey,
} from '@/composables/useQuickCapture'
import { useAgentAliases } from '@/composables/useAgentAliases'
import { useThemeSchedule } from '@/composables/useThemeSchedule'
import ThemeScheduleSetting from '@/components/ThemeScheduleSetting.vue'
import RecentAgentsPopover from '@/components/RecentAgentsPopover.vue'
import {
  useRecentAgents,
  installRecentAgentsHotkey,
  teardownRecentAgentsHotkey,
} from '@/composables/useRecentAgents'
import NotifyPromptBanner from '@/components/NotifyPromptBanner.vue'
import SettingsBackupMenu from '@/components/SettingsBackupMenu.vue'

const route = useRoute()
const router = useRouter()
const { effectiveTheme, currentTheme, setTheme } = useTheme()
const currentThemeLabel = computed(() => currentTheme.value)
const { username, logout: doLogout } = useAuth()
const { compact, toggleCompact } = useCompactMode()
const { registerShortcut } = useKeyboardShortcuts()
const { displayName: agentDisplayName } = useAgentAliases()

// ── Recent Agents Quick-switcher ────────────────────────────────────────────

const { visit: visitAgent, close: closeRecentAgents } = useRecentAgents()

/** Navigate to the selected agent from the RecentAgentsPopover */
function onSelectRecentAgent(agentId: string): void {
  appState.currentDesktopTab = 'monitor'
  appState.currentDetailAgentId = agentId
}

// Install the theme schedule ticker (auto-switches light/dark by time of day)
useThemeSchedule()

const isLoginPage = computed(() => route.name === 'login')

const isMac = computed(() =>
  /Mac/i.test(
    (typeof navigator !== 'undefined' ? (navigator.platform || navigator.userAgent) : '') ?? '',
  ),
)
const cmdKHint = computed(() => (isMac.value ? '⌘K' : 'Ctrl+K'))

function openPalette() {
  appState.commandPaletteRequest++
}

async function handleLogout() {
  await doLogout()
  router.push({ name: 'login' })
}

type DesktopTab = 'monitor' | 'system' | 'logs' | 'chat' | 'optimize'

function switchTab(tab: DesktopTab) {
  // When switching away from detail, reset detail state
  if (appState.currentDesktopTab === 'detail') {
    appState.currentDetailAgentId = ''
  }
  appState.currentDesktopTab = tab
}

const activeDesktopTab = computed<DesktopTab>(() => {
  const t = appState.currentDesktopTab
  // 'detail' is a sub-state of 'monitor' — highlight monitor tab
  if (t === 'detail') return 'monitor'
  return (t as DesktopTab) ?? 'monitor'
})

/**
 * Auto-detected context for Quick Capture.
 * When viewing an agent detail, includes the agent's display name.
 * Otherwise, uses the current tab name.
 */
const captureContext = computed<string>(() => {
  const tab = appState.currentDesktopTab
  if ((tab === 'detail' || tab === 'monitor') && appState.currentDetailAgentId) {
    const name = agentDisplayName(appState.currentDetailAgentId)
    return `AgentDetail: ${name}`
  }
  const TAB_LABELS: Record<string, string> = {
    monitor: 'MonitorTab',
    system: 'SystemTab',
    logs: 'LogsTab',
    chat: 'ChatTab',
    optimize: 'OptimizeTab',
    detail: 'AgentDetail',
  }
  return TAB_LABELS[tab] ?? tab
})

// ── Konami Code Easter Egg ──────────────────────────────────────────────────

const EMOJIS = ['🎉', '🎊', '✨', '🥳', '🦞', '🐾', '🚀', '💫']

const celebrating = ref(false)

function emojiStyle(i: number): Record<string, string> {
  const left = ((i * 37 + 11) % 90) + 5 // pseudo-random 5–95%
  const delay = ((i * 0.4) % 2).toFixed(2) // 0–2s stagger
  return {
    left: `${left}%`,
    animationDelay: `${delay}s`,
  }
}

function celebrate() {
  showToast('🎉 Konami unlocked! 50 PRs strong!', 'success')
  celebrating.value = true
  setTimeout(() => {
    celebrating.value = false
  }, 5000)
}

useKonamiCode(celebrate)

// ── Pomodoro timer ──────────────────────────────────────────────────────────

const pomo = usePomodoro((nextPhase) => {
  showToast(
    nextPhase === 'break'
      ? '🍅 Focus 結束！休息 5 分鐘'
      : '☕ 休息結束！繼續專注 25 分鐘',
    'success',
  )
})

registerShortcut({
  key: 'p',
  shift: true,
  handler: () => pomo.toggle(),
  description: 'Pomodoro 開關',
  category: 'Actions',
})

// ── Heartbeat Pulse ─────────────────────────────────────────────────────────

const heartbeatStats = computed(() => {
  const agents = appState.latestDashboard?.agents ?? []
  const total = agents.length
  const active = agents.filter((a: any) => String(a?.status ?? '').toLowerCase().includes('active')).length
  return {
    activeCount: active,
    totalCount: total,
    activeRatio: total > 0 ? active / total : 0,
  }
})

// ── Per-tab badge counters ───────────────────────────────────────────────────

/** 監控 / Agents — active agent count from latest dashboard */
const monitorBadgeCount = computed<number>(() => {
  const agents = appState.latestDashboard?.agents ?? []
  return agents.filter(
    (a) => a.status === 'active_executing' || a.status === 'active_recent',
  ).length
})

/** Cron — enabled cron jobs count from latest dashboard */
const cronBadgeCount = computed<number>(() => {
  const jobs = appState.latestDashboard?.cron ?? []
  return jobs.filter((j) => j.enabled).length
})

/** 日誌 / Logs — recent 5xx error count, polled every 30s */
const logsBadgeCount = ref<number>(0)

/** 告警 / Alerts — active (recent 5-min) alert count, polled every 30s */
const alertsBadgeCount = ref<number>(0)

const FIVE_MIN_MS = 5 * 60 * 1000

interface ErrorEntry {
  statusCode: number
  timestamp: string | number
}

interface AlertEntry {
  ts: number
}

interface ErrorsRecentResponse {
  success: boolean
  data?: { errors?: ErrorEntry[] }
  errors?: ErrorEntry[]
}

interface AlertsRecentBadgeResponse {
  success: boolean
  data?: { alerts?: AlertEntry[] }
  alerts?: AlertEntry[]
}

async function fetchBadgeCounts(): Promise<void> {
  const cutoff = Date.now() - FIVE_MIN_MS
  try {
    const errRes = (await api.get('/api/read/errors/recent?limit=50')) as ErrorsRecentResponse
    const errList: ErrorEntry[] = errRes.data?.errors ?? errRes.errors ?? []
    logsBadgeCount.value = errList.filter((e) => {
      const ts =
        typeof e.timestamp === 'number'
          ? e.timestamp
          : new Date(e.timestamp).getTime()
      return ts >= cutoff
    }).length
  } catch {
    // Silent — badge must not break the rest of the UI
  }

  try {
    const alertRes = (await api.get('/api/alerts/recent?limit=50')) as AlertsRecentBadgeResponse
    const alertList: AlertEntry[] = alertRes.data?.alerts ?? alertRes.alerts ?? []
    alertsBadgeCount.value = alertList.filter((a) => a.ts >= cutoff).length
  } catch {
    // Silent — badge must not break the rest of the UI
  }
}

let badgePollInterval: ReturnType<typeof setInterval> | null = null

let _uninstallShortcutsHelp: (() => void) | null = null

// ── Background tab notification badge ───────────────────────────────────────

const { increment: incrementBadge } = useNotificationBadge()
const { play: playSound } = useSoundEffect()

/**
 * Track which alert IDs we have already counted so repeated SSE frames or
 * poll cycles don't double-count the same alert.
 */
const _seenAlertIds = new Set<string>()

/** Watch for new active (unresolved) alerts while the tab is hidden. */
watch(
  () => appState.latestDashboard,
  (dashboard) => {
    if (!dashboard) return
    // alerts may live on the dashboard payload or a sibling field
    const alerts: Array<{ id?: string; resolved?: boolean }> =
      (dashboard as unknown as { alerts?: Array<{ id?: string; resolved?: boolean }> }).alerts ?? []

    for (const alert of alerts) {
      const id = alert.id ?? JSON.stringify(alert)
      if (!_seenAlertIds.has(id) && alert.resolved !== true) {
        _seenAlertIds.add(id)
        // increment only counts when document.hidden (handled inside composable)
        incrementBadge()
        // Audible alert — plays only if sound is enabled and not in quiet hours
        playSound('error')
      }
    }
  },
  { deep: true },
)

// Record agent visits whenever currentDetailAgentId is set
watch(
  () => appState.currentDetailAgentId,
  (newId) => {
    if (newId) visitAgent(newId)
  },
)

onMounted(() => {
  bootstrapPalette()
  bootstrapDensity()
  installNotificationBadge()
  installMessageRateTicker()
  void fetchBadgeCounts()
  badgePollInterval = setInterval(() => {
    void fetchBadgeCounts()
  }, 30_000)
  _uninstallShortcutsHelp = installShortcutsHelpHotkey()
  installOnboardingAutoStart()
  installWhatsNewAutoOpen()
  installQuickCaptureHotkey()
  installRecentAgentsHotkey()
})

onUnmounted(() => {
  teardownNotificationBadge()
  teardownMessageRateTicker()
  if (badgePollInterval !== null) {
    clearInterval(badgePollInterval)
    badgePollInterval = null
  }
  _uninstallShortcutsHelp?.()
  _uninstallShortcutsHelp = null
  teardownOnboardingAutoStart()
  teardownWhatsNewAutoOpen()
  teardownQuickCaptureHotkey()
  teardownRecentAgentsHotkey()
})

// ── Compact mode keyboard shortcut ─────────────────────────────────────────

registerShortcut({
  key: 'd',
  shift: true,
  handler: () => toggleCompact(),
  description: '切換 compact 模式',
  category: 'Actions',
})

// ── Voice Command ────────────────────────────────────────────────────────────

function handleTranscript(t: string) {
  const action = parseVoice(t)
  switch (action.type) {
    case 'navigate':
      appState.currentDesktopTab = action.target as string
      showToast(`🎙️ 切換到: ${action.target}`, 'success')
      break
    case 'open':
      if (action.target === 'palette') {
        appState.commandPaletteRequest++
        showToast('🎙️ 開啟 Command Palette', 'success')
      }
      break
    case 'search':
      appState.currentDesktopTab = 'monitor'
      appState.agentSearchQuery = action.query ?? ''
      showToast(`🎙️ 搜尋: ${action.query}`, 'success')
      break
    default:
      showToast(`🎙️ 未識別: ${t}`, 'info')
  }
}

const voice = useVoiceCommand(handleTranscript)

// ── SSE Reconnect ────────────────────────────────────────────────────────────

/** Called when the user clicks the ConnectionStatus dot while disconnected. */
function requestSSEReconnect(): void {
  appState.sseReconnectRequest++
}

// ── Ambient Mode ────────────────────────────────────────────────────────────

const ambient = useAmbientMode({
  getAgentIds: () => (appState.latestDashboard?.agents ?? []).map((a: any) => a.id as string),
  onCycle: (id: string) => {
    appState.currentDesktopTab = 'monitor'
    appState.currentDetailAgentId = id
  },
})

registerShortcut({
  key: 'm',
  shift: true,
  handler: () => ambient.toggle(),
  description: 'Ambient mode 切換',
  category: 'Actions',
})
</script>

<template>
  <div id="vue-app" :data-theme="effectiveTheme" :class="{ 'compact-mode': compact }">
    <header v-if="!isLoginPage" class="app-header">
      <!-- Match existing HTML structure exactly for CSS compatibility -->
      <div class="header-left">
        <div class="header-logo">🐾</div>
        <div class="header-title">
          <h1>OpenClaw Watch Pro</h1>
          <span class="header-subtitle">Agent 架構監控 (v3.0-Vue)</span>
        </div>
      </div>
      <div class="header-center">
        <div class="desktop-tabs" role="tablist" aria-label="主要導覽">
          <button
            :class="['desktop-tab', { active: activeDesktopTab === 'monitor' }]"
            role="tab"
            :aria-selected="activeDesktopTab === 'monitor'"
            @click="switchTab('monitor')"
          >
            🖥️ 監控
            <span
              v-if="shouldShowBadge(monitorBadgeCount)"
              class="tab-badge"
              :aria-label="`${monitorBadgeCount} 個 active agents`"
            >{{ formatBadge(monitorBadgeCount) }}</span>
            <span
              v-if="shouldShowBadge(cronBadgeCount)"
              class="tab-badge tab-badge--cron"
              :aria-label="`${cronBadgeCount} 個 enabled cron jobs`"
            >{{ formatBadge(cronBadgeCount) }}</span>
            <span
              v-if="shouldShowBadge(alertsBadgeCount)"
              class="tab-badge tab-badge--alert"
              :aria-label="`${alertsBadgeCount} 個 active alerts`"
            >{{ formatBadge(alertsBadgeCount) }}</span>
          </button>
          <button
            :class="['desktop-tab', { active: activeDesktopTab === 'system' }]"
            role="tab"
            :aria-selected="activeDesktopTab === 'system'"
            @click="switchTab('system')"
          >📊 系統/費用</button>
          <button
            :class="['desktop-tab', { active: activeDesktopTab === 'logs' }]"
            role="tab"
            :aria-selected="activeDesktopTab === 'logs'"
            @click="switchTab('logs')"
          >
            ⚙️ 日誌
            <span
              v-if="shouldShowBadge(logsBadgeCount)"
              class="tab-badge tab-badge--error"
              :aria-label="`${logsBadgeCount} 個 5xx 錯誤（最近 5 分鐘）`"
            >{{ formatBadge(logsBadgeCount) }}</span>
          </button>
          <button
            :class="['desktop-tab', { active: activeDesktopTab === 'chat' }]"
            role="tab"
            :aria-selected="activeDesktopTab === 'chat'"
            @click="switchTab('chat')"
          >💬 聊天室</button>
          <button
            :class="['desktop-tab', { active: activeDesktopTab === 'optimize' }]"
            role="tab"
            :aria-selected="activeDesktopTab === 'optimize'"
            @click="switchTab('optimize')"
          >🧠 優化</button>
        </div>
      </div>
      <div class="header-right">
        <button
          v-if="!isLoginPage"
          class="header-btn icon-only palette-opener-btn"
          :title="`快速命令 (${cmdKHint})`"
          aria-label="開啟 Command Palette"
          @click="openPalette"
        >⌘<span class="cmd-k-hint">K</span></button>
        <HeartbeatPulse
          v-if="!isLoginPage"
          :active-ratio="heartbeatStats.activeRatio"
          :active-count="heartbeatStats.activeCount"
          :total-count="heartbeatStats.totalCount"
        />
        <MessageRateSparkline v-if="!isLoginPage" />
        <ConnectionStatus
          v-if="!isLoginPage"
          :on-reconnect="requestSSEReconnect"
        />
        <AlertBadge v-if="!isLoginPage" />
        <button
          v-if="!isLoginPage"
          class="header-btn pomo-btn"
          :class="{
            'pomo-focus': pomo.phase.value === 'focus',
            'pomo-break': pomo.phase.value === 'break',
          }"
          :title="`Pomodoro: ${pomo.phase.value} (Shift+P)`"
          aria-label="Pomodoro timer"
          @click="pomo.toggle()"
          @contextmenu.prevent="pomo.reset()"
        >🍅 {{ pomo.phase.value === 'idle' ? '25:00' : pomo.remainingDisplay.value }}</button>
        <button
          class="header-btn icon-only"
          :title="`Compact 模式 (${compact ? 'ON' : 'OFF'})`"
          :aria-pressed="compact"
          @click="toggleCompact"
        >📐</button>
        <button
          v-if="!isLoginPage"
          class="header-btn icon-only ambient-btn"
          :title="`Ambient mode (${ambient.enabled.value ? 'ON' : 'OFF'}) (Shift+M)`"
          :aria-pressed="ambient.enabled.value"
          @click="ambient.toggle()"
        >📺</button>
        <button
          v-if="!isLoginPage"
          class="header-btn icon-only voice-btn"
          :class="{ 'voice-btn--listening': voice.listening.value, 'voice-btn--unsupported': !voice.supported.value }"
          :disabled="!voice.supported.value"
          :title="voice.supported.value ? (voice.listening.value ? '錄音中…點擊停止' : '語音指令') : '瀏覽器不支援'"
          aria-label="voice command"
          @click="voice.toggle()"
        >🎙️</button>
        <select
          :value="currentTheme"
          class="header-theme-select"
          :title="`目前主題: ${currentThemeLabel}`"
          aria-label="主題"
          @change="setTheme(($event.target as HTMLSelectElement).value as ThemeMode)"
        >
          <option value="light">☀️ Light</option>
          <option value="dark">🌙 Dark</option>
          <option value="auto">🌓 Auto</option>
          <option value="neon">⚡ Neon</option>
          <option value="retro">📟 Retro</option>
        </select>
        <span style="font-size:12px;color:var(--text-muted);margin:0 4px">{{ username }}</span>
        <button
          class="header-btn icon-only"
          title="登出"
          aria-label="登出"
          style="font-size:16px"
          @click="handleLogout"
        >⏻</button>
      </div>
    </header>

    <router-view />

    <!-- Global UI overlays -->
    <NotifyPromptBanner />
    <ToastContainer />
    <ConfirmDialog />
    <KeyboardShortcutsHelp />
    <OnboardingTour />
    <QuietHoursSetting />
    <WhatsNew />
    <WorkspaceProfileMenu />
    <QuickCaptureModal :current-context="captureContext" />
    <QuickCaptureList />
    <ThemeScheduleSetting />
    <RecentAgentsPopover
      :current-agent-id="appState.currentDetailAgentId || null"
      @select="onSelectRecentAgent"
      @close="closeRecentAgents"
    />
    <SettingsBackupMenu />

    <!-- Konami Code Easter Egg -->
    <div v-if="celebrating" class="konami-celebrate" aria-hidden="true">
      <span
        v-for="i in 12"
        :key="i"
        class="konami-emoji"
        :style="emojiStyle(i)"
      >{{ EMOJIS[i % EMOJIS.length] }}</span>
    </div>
  </div>
</template>

<style>
/* Import existing CSS files — they use CSS custom properties from theme.css */
@import './assets/css/theme.css';
@import './assets/css/style.css';
@import './assets/css/taskhub.css';
@import './assets/css/a11y.css';
@import './assets/css/overhaul.css';
@import './assets/css/ux-patterns.css';
@import './assets/css/vue-fixes.css';

/* ── Compact density mode ─────────────────────────────────────────────────── */

#vue-app.compact-mode .detail-card,
#vue-app.compact-mode .agent-card,
#vue-app.compact-mode .obs-card,
#vue-app.compact-mode .alert-card,
#vue-app.compact-mode .info-card,
#vue-app.compact-mode .summary-card,
#vue-app.compact-mode .sys-card,
#vue-app.compact-mode .health-card,
#vue-app.compact-mode .insights-card,
#vue-app.compact-mode .wof-card {
  padding: 0.6em !important;
  font-size: 0.88em;
}

#vue-app.compact-mode .detail-card-title,
#vue-app.compact-mode .obs-card-title,
#vue-app.compact-mode .health-card-title,
#vue-app.compact-mode .insights-card-title {
  font-size: 0.95em;
  margin-bottom: 0.4em;
}

#vue-app.compact-mode table {
  font-size: 0.86em;
}
</style>

<style scoped>
/* Command Palette opener button in the header */
.palette-opener-btn {
  font-size: 12px;
  letter-spacing: -0.01em;
  padding: 0.25rem 0.45rem;
  opacity: 0.75;
  transition: opacity 0.15s;
}

.palette-opener-btn:hover {
  opacity: 1;
}

.cmd-k-hint {
  font-size: 11px;
  font-weight: 600;
  margin-left: 1px;
}

/* ── Pomodoro button ──────────────────────────────────────────────────────── */

.pomo-btn {
  font-size: 12px;
  font-weight: 600;
  padding: 0.25rem 0.5rem;
  letter-spacing: 0.01em;
  transition: background-color 0.2s, color 0.2s, border-color 0.2s;
  white-space: nowrap;
}

.pomo-btn.pomo-focus {
  color: #e55;
  border-color: #e55;
}

.pomo-btn.pomo-break {
  color: #2a9;
  border-color: #2a9;
}

.header-theme-select {
  display: inline-flex;
  align-items: center;
  padding: 4px 8px;
  border: 1px solid var(--border);
  background: var(--bg-input);
  color: var(--text-secondary);
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
  appearance: none;
  -webkit-appearance: none;
}

.header-theme-select:hover,
.header-theme-select:focus {
  border-color: var(--accent);
  color: var(--accent);
  outline: none;
}

/* ── Voice Command Button ─────────────────────────────────────────────────── */

.voice-btn--unsupported {
  opacity: 0.35;
  cursor: not-allowed;
}

.voice-btn--listening {
  color: #e55;
  border-color: #e55;
  animation: voice-pulse 1s ease-in-out infinite;
}

@keyframes voice-pulse {
  0%, 100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.6;
    transform: scale(1.12);
  }
}

/* ── Konami Code Easter Egg ───────────────────────────────────────────────── */

.konami-celebrate {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 9999;
  border: 6px solid transparent;
  animation: konami-rainbow 1s linear infinite;
}

.konami-emoji {
  position: absolute;
  top: -10%;
  font-size: clamp(1.5rem, 3vw, 2.5rem);
  animation: konami-fall 4s ease-in forwards;
  user-select: none;
}

@keyframes konami-fall {
  0% {
    top: -10%;
    opacity: 1;
  }
  100% {
    top: 110%;
    opacity: 0;
    transform: rotate(360deg);
  }
}

@keyframes konami-rainbow {
  from {
    filter: hue-rotate(0deg);
  }
  to {
    filter: hue-rotate(360deg);
  }
}

/* ── Per-tab badge counters ───────────────────────────────────────────────── */

.desktop-tab {
  position: relative;
}

.tab-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 8px;
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
  text-align: center;
  vertical-align: middle;
  margin-left: 5px;
  background-color: var(--accent, #7c7cff);
  color: #fff;
  pointer-events: none;
}

/* Cron badge — secondary accent (purple) */
.tab-badge--cron {
  background-color: var(--purple, #a78bfa);
}

/* Alerts badge — danger red */
.tab-badge--alert {
  background-color: var(--red, #ef5f5f);
}

/* Log 5xx badge — orange warning */
.tab-badge--error {
  background-color: var(--orange, #e5a53d);
  color: #fff;
}

@media (prefers-reduced-motion: reduce) {
  .tab-badge {
    /* No pulse/scale animation — only static display */
    animation: none;
    transition: none;
  }
}
</style>
