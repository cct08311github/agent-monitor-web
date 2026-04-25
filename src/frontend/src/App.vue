<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTheme } from '@/composables/useTheme'
import { useAuth } from '@/composables/useAuth'
import { appState } from '@/stores/appState'
import ToastContainer from '@/components/ToastContainer.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import AlertBadge from '@/components/AlertBadge.vue'

const route = useRoute()
const router = useRouter()
const { effectiveTheme, currentTheme, cycleTheme } = useTheme()
const { username, logout: doLogout } = useAuth()

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

const themeIcon = computed(() => {
  if (currentTheme.value === 'light') return '☀️'
  if (currentTheme.value === 'dark') return '🌙'
  return '🌓'
})

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
</script>

<template>
  <div id="vue-app" :data-theme="effectiveTheme">
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
          >🖥️ 監控</button>
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
          >⚙️ 日誌</button>
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
        <AlertBadge v-if="!isLoginPage" />
        <button class="header-btn icon-only" :title="themeIcon" @click="cycleTheme">{{ themeIcon }}</button>
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
    <ToastContainer />
    <ConfirmDialog />
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
</style>
