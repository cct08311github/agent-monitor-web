<script setup lang="ts">
import { ref, computed, nextTick, onUnmounted } from 'vue'
import { useSSE } from '@/composables/useSSE'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LOG_BUFFER_MAX = 500
const SCROLL_THRESHOLD = 50

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LogLevel = 'error' | 'warn' | 'info'

interface LogEntry {
  line: string
  level: LogLevel
  /** Extra CSS class derived from line content (err / warn / info) */
  cls: string
}

// ---------------------------------------------------------------------------
// SSE handle
// ---------------------------------------------------------------------------

const sse = useSSE()
const streaming = ref(false)

// ---------------------------------------------------------------------------
// Log state
// ---------------------------------------------------------------------------

const logBuffer = ref<LogEntry[]>([])
const filterText = ref('')
const errorOnly = ref(false)
const warnOnly = ref(false)
const userScrolledUp = ref(false)
const hasNewMessages = ref(false)

// ---------------------------------------------------------------------------
// DOM ref
// ---------------------------------------------------------------------------

const terminalRef = ref<HTMLDivElement | null>(null)

// ---------------------------------------------------------------------------
// Computed: visible lines after filter
// ---------------------------------------------------------------------------

const visibleLines = computed<LogEntry[]>(() => {
  return logBuffer.value.filter((entry) => lineMatchesFilter(entry.line))
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function detectLineLevel(line: string): LogLevel {
  const l = line.toUpperCase()
  if (l.includes('ERROR') || l.includes(' ERR ') || l.includes('[ERR]')) return 'error'
  if (l.includes('WARN')) return 'warn'
  return 'info'
}

function deriveLineCls(line: string): string {
  const lower = line.toLowerCase()
  if (lower.includes('error') || lower.includes('err ') || lower.includes('[error]')) return 'err'
  if (lower.includes('warn') || lower.includes('[warn]')) return 'warn'
  if (lower.includes('info') || lower.includes('[info]')) return 'info'
  return ''
}

function lineMatchesFilter(line: string): boolean {
  const level = detectLineLevel(line)
  if (errorOnly.value && level !== 'error') return false
  if (warnOnly.value && level !== 'error' && level !== 'warn') return false
  if (filterText.value && !line.toLowerCase().includes(filterText.value.toLowerCase())) return false
  return true
}

/** Split a log line into segments for keyword highlighting. */
function buildSegments(line: string, keyword: string): Array<{ text: string; highlight: boolean }> {
  if (!keyword) return [{ text: line, highlight: false }]
  const segments: Array<{ text: string; highlight: boolean }> = []
  const lower = line.toLowerCase()
  const kLower = keyword.toLowerCase()
  let pos = 0
  while (pos < line.length) {
    const idx = lower.indexOf(kLower, pos)
    if (idx === -1) {
      segments.push({ text: line.slice(pos), highlight: false })
      break
    }
    if (idx > pos) segments.push({ text: line.slice(pos, idx), highlight: false })
    segments.push({ text: line.slice(idx, idx + keyword.length), highlight: true })
    pos = idx + keyword.length
  }
  return segments
}

// ---------------------------------------------------------------------------
// Scroll handling
// ---------------------------------------------------------------------------

function onScroll(): void {
  const el = terminalRef.value
  if (!el) return
  const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < SCROLL_THRESHOLD
  userScrolledUp.value = !nearBottom
  if (nearBottom) {
    hasNewMessages.value = false
  }
}

function scrollToBottom(): void {
  const el = terminalRef.value
  if (!el) return
  el.scrollTop = el.scrollHeight
  userScrolledUp.value = false
  hasNewMessages.value = false
}

// ---------------------------------------------------------------------------
// Append a new line to the buffer
// ---------------------------------------------------------------------------

function appendLine(line: string): void {
  const level = detectLineLevel(line)
  const cls = deriveLineCls(line)
  logBuffer.value.push({ line, level, cls })
  if (logBuffer.value.length > LOG_BUFFER_MAX) {
    logBuffer.value.shift()
  }

  // Only trigger scroll logic if line passes current filter
  if (!lineMatchesFilter(line)) return

  nextTick(() => {
    if (!userScrolledUp.value) {
      scrollToBottom()
    } else {
      hasNewMessages.value = true
    }
  })
}

// ---------------------------------------------------------------------------
// Stream control
// ---------------------------------------------------------------------------

function toggleStream(): void {
  if (streaming.value) {
    stopStream()
  } else {
    startStream()
  }
}

function startStream(): void {
  const el = terminalRef.value
  if (el) {
    // Show connecting indicator
    logBuffer.value = [{ line: '連接中...', level: 'info', cls: 'info' }]
  }

  sse.connect('/api/logs/stream', {
    autoReconnect: false,
    onOpen() {
      streaming.value = true
    },
    onMessage(event: MessageEvent) {
      try {
        const parsed = JSON.parse(event.data as string) as { line?: string; ts?: number }
        if (parsed.line) appendLine(parsed.line)
      } catch {
        // Malformed message — ignore
      }
    },
    onError() {
      appendLine('[連線中斷，請重新開始監看]')
      stopStream()
    },
  })
}

function stopStream(): void {
  sse.close()
  streaming.value = false
}

function clearLog(): void {
  logBuffer.value = [{ line: '日誌已清除', level: 'info', cls: 'info' }]
  hasNewMessages.value = false
}

// ---------------------------------------------------------------------------
// Filter actions
// ---------------------------------------------------------------------------

function applyFilter(): void {
  // visibleLines is already computed; just reset scroll state
  hasNewMessages.value = false
}

function toggleErrorOnly(): void {
  errorOnly.value = !errorOnly.value
  if (errorOnly.value) warnOnly.value = false
  applyFilter()
}

function toggleWarnOnly(): void {
  warnOnly.value = !warnOnly.value
  if (warnOnly.value) errorOnly.value = false
  applyFilter()
}

// ---------------------------------------------------------------------------
// Cleanup on unmount
// ---------------------------------------------------------------------------

onUnmounted(() => {
  stopStream()
})
</script>

<template>
  <div class="logs-tab">
    <!-- Header + controls -->
    <div class="section-header">
      <h2>⚙️ 日誌</h2>
      <div class="log-controls">
        <button @click="toggleStream">
          {{ streaming ? '⏹ 停止監看' : '▶ 開始監看' }}
        </button>
        <button @click="clearLog">🗑 清除</button>
        <input
          v-model="filterText"
          class="log-filter-input"
          placeholder="篩選..."
          @input="applyFilter"
        />
        <button
          :class="['log-filter-btn', { 'active-error': errorOnly }]"
          @click="toggleErrorOnly"
        >
          ❌ Error
        </button>
        <button
          :class="['log-filter-btn', { 'active-warn': warnOnly }]"
          @click="toggleWarnOnly"
        >
          ⚠️ Warn
        </button>
      </div>
    </div>

    <!-- Status bar -->
    <div class="oc-log-status-bar">
      <span :class="['oc-log-badge', { live: streaming }]">
        {{ streaming ? '● 監看中' : '● 已停止' }}
      </span>
    </div>

    <!-- Terminal -->
    <div
      ref="terminalRef"
      class="oc-log-terminal"
      @scroll="onScroll"
    >
      <div
        v-for="(entry, i) in visibleLines"
        :key="i"
        :class="['log-line', entry.level, 'oc-log-line', entry.cls]"
      >
        <template
          v-for="(seg, si) in buildSegments(entry.line, filterText)"
          :key="si"
        >
          <mark v-if="seg.highlight">{{ seg.text }}</mark>
          <template v-else>{{ seg.text }}</template>
        </template>
      </div>
    </div>

    <!-- Scroll-to-bottom button -->
    <button
      v-show="hasNewMessages && userScrolledUp"
      class="log-scroll-btn"
      @click="scrollToBottom"
    >
      ⬇ 新訊息
    </button>
  </div>
</template>
