<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { api } from '@/composables/useApi'
import { createFocusTrap } from '@/lib/focusTrap'
import { formatDuration } from '@/lib/time'

const props = defineProps<{
  agentId: string
  sessionId: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

interface SessionMessage {
  role: string
  text?: string
  toolUses?: string[]
  ts?: string | null
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const messages = ref<SessionMessage[]>([])
const loading = ref(true)
const error = ref(false)

const cursorIndex = ref(0)
const playing = ref(false)
const speed = ref<1 | 2 | 4>(1)
let playTimer: ReturnType<typeof setTimeout> | null = null

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

async function fetchMessages(): Promise<void> {
  loading.value = true
  error.value = false
  try {
    const data = (await api.get(
      `/api/agents/${encodeURIComponent(props.agentId)}/sessions/${encodeURIComponent(props.sessionId)}`
    )) as { success?: boolean; messages?: SessionMessage[] }
    messages.value = data?.messages ?? []
  } catch {
    error.value = true
  } finally {
    loading.value = false
  }
}

// ---------------------------------------------------------------------------
// Computed
// ---------------------------------------------------------------------------

const visibleMessages = computed<SessionMessage[]>(() =>
  messages.value.slice(0, cursorIndex.value + 1)
)

const totalDurationMs = computed<number>(() => {
  if (messages.value.length < 2) return 0
  const first = messages.value[0].ts ? Date.parse(messages.value[0].ts) : NaN
  const last = messages.value[messages.value.length - 1].ts
    ? Date.parse(messages.value[messages.value.length - 1].ts as string)
    : NaN
  if (Number.isNaN(first) || Number.isNaN(last)) return 0
  return Math.max(0, last - first)
})

const currentProgress = computed<number>(() => {
  if (messages.value.length <= 1) return 0
  return cursorIndex.value / (messages.value.length - 1)
})

/** Delta (ms) between messages[i] and messages[i-1] ts. Returns 0 for null/missing ts or index 0. */
function deltaFromPrev(i: number): number {
  if (i <= 0 || messages.value.length === 0) return 0
  const curr = messages.value[i]?.ts
  const prev = messages.value[i - 1]?.ts
  if (!curr || !prev) return 0
  const currMs = Date.parse(curr)
  const prevMs = Date.parse(prev)
  if (Number.isNaN(currMs) || Number.isNaN(prevMs)) return 0
  return Math.max(0, currMs - prevMs)
}

// ---------------------------------------------------------------------------
// Playback controls
// ---------------------------------------------------------------------------

function clearTimer(): void {
  if (playTimer !== null) {
    clearTimeout(playTimer)
    playTimer = null
  }
}

function scheduleNextAdvance(): void {
  clearTimer()
  const nextIndex = cursorIndex.value + 1
  if (nextIndex >= messages.value.length) {
    playing.value = false
    return
  }
  const delta = deltaFromPrev(nextIndex)
  const delay = delta > 0 ? Math.max(50, delta / speed.value) : 50
  playTimer = setTimeout(() => {
    cursorIndex.value = nextIndex
    if (nextIndex >= messages.value.length - 1) {
      playing.value = false
    } else if (playing.value) {
      scheduleNextAdvance()
    }
  }, delay)
}

function play(): void {
  if (cursorIndex.value >= messages.value.length - 1) {
    cursorIndex.value = 0
  }
  playing.value = true
  scheduleNextAdvance()
}

function pause(): void {
  clearTimer()
  playing.value = false
}

function reset(): void {
  pause()
  cursorIndex.value = 0
}

function setSpeed(n: 1 | 2 | 4): void {
  speed.value = n
}

function seek(i: number): void {
  pause()
  cursorIndex.value = Math.min(Math.max(0, i), messages.value.length - 1)
}

// ---------------------------------------------------------------------------
// Focus trap
// ---------------------------------------------------------------------------

const dialogRef = ref<HTMLDivElement | null>(null)
const trap = createFocusTrap()

onMounted(() => {
  fetchMessages()
  if (dialogRef.value) trap.activate(dialogRef.value, () => emit('close'))
})

onBeforeUnmount(() => {
  clearTimer()
  trap.deactivate()
})

function handleOverlayClick(event: MouseEvent): void {
  if ((event.target as HTMLElement).classList.contains('modal-overlay')) {
    emit('close')
  }
}
</script>

<template>
  <div class="modal-overlay" style="display:flex" @click="handleOverlayClick">
    <div
      ref="dialogRef"
      class="modal-content sr-dialog"
      role="dialog"
      aria-modal="true"
      aria-label="Session Replay"
    >
      <!-- Header -->
      <div class="sr-header">
        <span class="sr-title">
          ▶ Replay · {{ sessionId.slice(-12) }}
          <span v-if="!loading && !error && messages.length > 0" class="sr-meta">
            · 總時長 {{ formatDuration(totalDurationMs) }}
            · {{ cursorIndex + 1 }} / {{ messages.length }}
          </span>
        </span>
        <button class="modal-close ctrl-btn" aria-label="關閉 Replay" @click="$emit('close')">✕</button>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="sr-state-msg">載入中…</div>

      <!-- Error -->
      <div v-else-if="error" class="sr-state-msg">
        ⚠️ 載入失敗<br />
        <a href="#" style="color:var(--blue,#5a5aeb);font-size:13px;margin-top:8px;display:inline-block" @click.prevent="fetchMessages">重試</a>
      </div>

      <!-- Empty -->
      <div v-else-if="messages.length === 0" class="sr-state-msg">無訊息記錄</div>

      <!-- Main replay UI -->
      <template v-else>
        <!-- Scrubber -->
        <div class="sr-scrubber-row">
          <input
            type="range"
            class="sr-scrubber"
            :min="0"
            :max="messages.length - 1"
            :value="cursorIndex"
            aria-label="時間軸位置"
            @input="seek(parseInt(($event.target as HTMLInputElement).value, 10))"
          />
          <span class="sr-progress-label">{{ Math.round(currentProgress * 100) }}%</span>
        </div>

        <!-- Controls -->
        <div class="sr-controls">
          <button
            class="sr-btn sr-play-pause"
            :aria-label="playing ? '暫停' : '播放'"
            @click="playing ? pause() : play()"
          >
            {{ playing ? '⏸ 暫停' : '▶ 播放' }}
          </button>

          <select
            class="sr-speed-select"
            :value="speed"
            aria-label="播放速度"
            @change="setSpeed(parseInt(($event.target as HTMLSelectElement).value, 10) as 1 | 2 | 4)"
          >
            <option value="1">1x</option>
            <option value="2">2x</option>
            <option value="4">4x</option>
          </select>

          <button class="sr-btn sr-reset" aria-label="重設" @click="reset">⏮ 重設</button>
        </div>

        <!-- Messages -->
        <div class="sr-messages">
          <template v-for="(msg, i) in visibleMessages" :key="i">
            <!-- Delta hint — only for gaps >= 60s -->
            <div v-if="i > 0 && deltaFromPrev(i) >= 60000" class="sr-delta-hint">
              ⏱ {{ formatDuration(deltaFromPrev(i)) }} 後…
            </div>
            <!-- Message bubble -->
            <div
              class="sr-message"
              :class="msg.role === 'user' ? 'sr-message--user' : 'sr-message--assistant'"
            >
              <div class="sr-role-row">
                <span class="sr-role-label">{{ msg.role.toUpperCase() }}</span>
              </div>
              <div v-if="msg.text" class="sr-text">{{ msg.text }}</div>
              <div v-if="msg.toolUses && msg.toolUses.length > 0" class="sr-tools">
                🔧 {{ msg.toolUses.join(', ') }}
              </div>
            </div>
          </template>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.sr-dialog {
  max-width: 700px;
  width: 95%;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
}

.sr-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.sr-title {
  font-size: 14px;
  font-weight: 600;
}

.sr-meta {
  font-weight: 400;
  opacity: 0.7;
  font-size: 13px;
}

.sr-state-msg {
  color: var(--text-muted);
  text-align: center;
  padding: 32px 24px;
}

.sr-scrubber-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px 4px;
  flex-shrink: 0;
}

.sr-scrubber {
  flex: 1;
  accent-color: var(--blue, #5a5aeb);
  cursor: pointer;
}

.sr-progress-label {
  font-size: 12px;
  color: var(--text-muted);
  width: 38px;
  text-align: right;
  flex-shrink: 0;
}

.sr-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 16px 10px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.sr-btn {
  padding: 4px 12px;
  border-radius: 6px;
  border: 1px solid var(--border-color);
  background: var(--bg-muted);
  color: var(--text-primary);
  cursor: pointer;
  font-size: 13px;
  line-height: 1.6;
  transition: background 0.15s;
}

.sr-btn:hover {
  background: var(--blue, #5a5aeb);
  color: #fff;
  border-color: var(--blue, #5a5aeb);
}

.sr-play-pause {
  min-width: 80px;
}

.sr-speed-select {
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid var(--border-color);
  background: var(--bg-muted);
  color: var(--text-primary);
  font-size: 13px;
  cursor: pointer;
}

.sr-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sr-delta-hint {
  text-align: center;
  font-size: 11px;
  color: var(--text-muted);
  padding: 4px 8px;
  border-radius: 12px;
  background: var(--bg-muted);
  align-self: center;
}

.sr-message {
  position: relative;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.5;
  max-width: 90%;
}

.sr-message--user {
  margin-left: auto;
  background: var(--blue, #5a5aeb);
  color: #fff;
}

.sr-message--assistant {
  background: var(--bg-muted);
  color: var(--text-primary);
}

.sr-role-row {
  margin-bottom: 4px;
}

.sr-role-label {
  font-size: 10px;
  font-weight: 600;
  opacity: 0.7;
}

.sr-text {
  white-space: pre-wrap;
  word-break: break-word;
}

.sr-tools {
  margin-top: 4px;
  font-size: 11px;
  opacity: 0.75;
  font-family: monospace;
}
</style>
