<script setup lang="ts">
import { computed } from 'vue'
import { appState } from '@/stores/appState'
import { relativeTimeFromNow } from '@/utils/relativeTime'
import type { SSEStatus } from '@/composables/useSSEStatus'

const props = defineProps<{
  /** Callback to trigger a manual reconnect when the user clicks the dot. */
  onReconnect: () => void
  /**
   * Reactive "now" injected for testing (defaults to Date.now()).
   * In production, leave undefined — the component reads Date.now() internally
   * via the 1 s ticker in appState (sseLastHeartbeatAt updates reactively).
   */
  nowMs?: number
}>()

const status = computed<SSEStatus>(() => appState.sseStatus)
const lastHeartbeatAt = computed<number>(() => appState.sseLastHeartbeatAt)
const reconnectAttempt = computed<number>(() => appState.sseReconnectAttempt)

/** Build the native tooltip title string. */
const title = computed<string>(() => {
  switch (status.value) {
    case 'connected': {
      if (lastHeartbeatAt.value === 0) return '連線中'
      const rel = relativeTimeFromNow(lastHeartbeatAt.value, props.nowMs ?? Date.now())
      return `連線中・上次心跳: ${rel}`
    }
    case 'reconnecting':
      return `重新連線中... (#${reconnectAttempt.value})`
    case 'disconnected':
      return '已斷線・點擊重連'
    default:
      return '等待連線'
  }
})

/** CSS modifier class for the dot. */
const dotClass = computed<string>(() => `conn-dot--${status.value}`)

function handleClick(): void {
  if (status.value === 'disconnected') {
    props.onReconnect()
  }
}
</script>

<template>
  <button
    class="conn-status-btn"
    :class="{ 'conn-status-btn--clickable': status === 'disconnected' }"
    :title="title"
    :aria-label="title"
    :disabled="status !== 'disconnected'"
    @click="handleClick"
  >
    <span class="conn-dot" :class="dotClass" aria-hidden="true" />
    <!-- Visually hidden label for screen readers -->
    <span class="sr-only">SSE 連線狀態: {{ title }}</span>
  </button>
</template>

<style scoped>
/* ── Container button ─────────────────────────────────────────────────────── */

.conn-status-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: var(--radius-sm, 6px);
  background: transparent;
  cursor: default;
  transition: background-color 0.15s, border-color 0.15s;
}

.conn-status-btn--clickable {
  cursor: pointer;
}

.conn-status-btn--clickable:hover {
  background: var(--bg-hover, rgba(255, 255, 255, 0.06));
  border-color: var(--red, #ef5f5f);
}

.conn-status-btn:focus-visible {
  outline: 2px solid var(--accent, #7c7cff);
  outline-offset: 2px;
}

/* Disabled (idle / connected / reconnecting) — pointer interactions muted */
.conn-status-btn:disabled {
  cursor: default;
  pointer-events: auto; /* keep hover for tooltip */
}

/* ── Status dot ───────────────────────────────────────────────────────────── */

.conn-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

/* Idle — gray */
.conn-dot--idle {
  background-color: var(--text-muted, #8a8a92);
}

/* Connected — green, gentle pulse */
.conn-dot--connected {
  background-color: var(--green, #45e0a8);
  box-shadow: 0 0 0 0 var(--green, #45e0a8);
  animation: conn-pulse 2.4s ease-in-out infinite;
}

/* Reconnecting — yellow/orange, spinner ring */
.conn-dot--reconnecting {
  background-color: var(--orange, #e5a53d);
  box-shadow: 0 0 0 2px var(--orange, #e5a53d), 0 0 0 4px transparent;
  animation: conn-spin-ring 1s linear infinite;
}

/* Disconnected — red, no animation */
.conn-dot--disconnected {
  background-color: var(--red, #ef5f5f);
}

/* ── Animations ───────────────────────────────────────────────────────────── */

@keyframes conn-pulse {
  0%, 100% {
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--green, #45e0a8) 60%, transparent);
    transform: scale(1);
  }
  50% {
    box-shadow: 0 0 0 5px color-mix(in srgb, var(--green, #45e0a8) 0%, transparent);
    transform: scale(1.05);
  }
}

@keyframes conn-spin-ring {
  0% {
    box-shadow: 2px 0 0 0 var(--orange, #e5a53d);
  }
  25% {
    box-shadow: 0 2px 0 0 var(--orange, #e5a53d);
  }
  50% {
    box-shadow: -2px 0 0 0 var(--orange, #e5a53d);
  }
  75% {
    box-shadow: 0 -2px 0 0 var(--orange, #e5a53d);
  }
  100% {
    box-shadow: 2px 0 0 0 var(--orange, #e5a53d);
  }
}

/* ── Reduced motion ───────────────────────────────────────────────────────── */

@media (prefers-reduced-motion: reduce) {
  .conn-dot--connected,
  .conn-dot--reconnecting {
    animation: none;
    box-shadow: none;
  }
}

/* ── Accessible visually-hidden helper ───────────────────────────────────── */

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
