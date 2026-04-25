<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTheme, type ThemeMode } from '@/composables/useTheme'
import { useAuth } from '@/composables/useAuth'
import { useKonamiCode } from '@/composables/useKonamiCode'
import { showToast } from '@/composables/useToast'
import { appState } from '@/stores/appState'
import ToastContainer from '@/components/ToastContainer.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import AlertBadge from '@/components/AlertBadge.vue'

const route = useRoute()
const router = useRouter()
const { effectiveTheme, currentTheme, setTheme } = useTheme()
const currentThemeLabel = computed(() => currentTheme.value)
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
    <ToastContainer />
    <ConfirmDialog />

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
</style>
