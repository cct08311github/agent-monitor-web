<script setup lang="ts">
import { ref, computed, nextTick, onUnmounted, watch } from 'vue'
import { useSSE } from '@/composables/useSSE'
import { showToast } from '@/composables/useToast'

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
  /** M3: stable monotonic id so Vue's :key is stable across buffer shifts */
  id: number
  line: string
  level: LogLevel
  /** Extra CSS class derived from line content (err / warn / info) */
  cls: string
  /** Timestamp from SSE payload or client-side fallback (epoch ms) */
  ts: number
}

// M3: monotonic counter for stable entry IDs
let _entrySeq = 0

// ---------------------------------------------------------------------------
// SSE handle
// ---------------------------------------------------------------------------

const sse = useSSE()

/**
 * `streaming` tracks user intent — true between "start" and "stop" clicks,
 * regardless of whether the underlying connection is currently open or
 * mid-reconnect. Use `sse.isConnected` for actual socket state.
 */
const streaming = ref(false)

// ---------------------------------------------------------------------------
// Connection status (4 states)
// ---------------------------------------------------------------------------

type ConnectionStatus = 'idle' | 'live' | 'reconnecting' | 'failed'

// Expose useSSE refs at script root so template auto-unwraps them.
// (Refs nested under a plain object like `sse` are NOT auto-unwrapped.)
const reconnectAttempt = sse.reconnectAttempt

const connectionStatus = computed<ConnectionStatus>(() => {
  if (!streaming.value) return 'idle'
  if (sse.isFailed.value) return 'failed'
  if (sse.isConnected.value) return 'live'
  return 'reconnecting'
})

const STATUS_LABELS: Record<ConnectionStatus, string> = {
  idle: '● 已停止',
  live: '● 即時監看中',
  reconnecting: '● 重新連線中',
  failed: '● 連線中斷',
}

// ---------------------------------------------------------------------------
// Log state
// ---------------------------------------------------------------------------

const logBuffer = ref<LogEntry[]>([])
const filterText = ref('')
const errorOnly = ref(false)
const warnOnly = ref(false)
const userScrolledUp = ref(false)
const hasNewMessages = ref(false)

/**
 * Paused mode: SSE stays connected but new lines are queued, not displayed.
 * Resume flushes the queue into the visible buffer.
 */
const paused = ref(false)
const pauseQueue = ref<LogEntry[]>([])

/** Whether to show HH:mm:ss timestamp prefix on each log line */
const showTimestamp = ref(true)

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

/** Format epoch ms → HH:mm:ss for log line prefix */
function formatTs(ts: number): string {
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return '--:--:--'
  return d.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
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

function appendLine(line: string, ts?: number): void {
  const level = detectLineLevel(line)
  const cls = deriveLineCls(line)
  const entry: LogEntry = { id: ++_entrySeq, line, level, cls, ts: ts ?? Date.now() }

  // When paused, queue entries instead of appending to visible buffer
  if (paused.value) {
    pauseQueue.value.push(entry)
    // Cap the queue to avoid unbounded growth during long pauses
    if (pauseQueue.value.length > LOG_BUFFER_MAX) {
      pauseQueue.value.splice(0, pauseQueue.value.length - LOG_BUFFER_MAX)
    }
    return
  }

  logBuffer.value.push(entry)
  if (logBuffer.value.length > LOG_BUFFER_MAX) {
    logBuffer.value.splice(0, logBuffer.value.length - LOG_BUFFER_MAX)
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
  // Mark intent first so the status badge flips to "reconnecting" immediately
  streaming.value = true

  const el = terminalRef.value
  if (el) {
    // Show connecting indicator
    logBuffer.value = [{ id: ++_entrySeq, line: '連接中...', level: 'info', cls: 'info', ts: Date.now() }]
  }

  sse.connect('/api/logs/stream', {
    autoReconnect: true,
    onMessage(event: MessageEvent) {
      try {
        const parsed = JSON.parse(event.data as string) as { line?: string; ts?: number }
        if (parsed.line) appendLine(parsed.line, parsed.ts)
      } catch {
        // Malformed SSE frame — ignore
      }
    },
    onReconnecting(attempt: number, delayMs: number) {
      // Inject a [WARN] line so detectLineLevel picks it up and styles it.
      // useSSE has already closed the previous EventSource and scheduled
      // the next attempt; we just narrate it to the user here.
      appendLine(`[WARN] 連線中斷，${Math.round(delayMs / 1000)}s 後重試（第 ${attempt} 次）`)
    },
    onResumed() {
      appendLine('[INFO] 分頁恢復可見，重新建立連線')
    },
  })
}

/**
 * Called by the user "stop" button. Closing useSSE marks the handle as
 * terminal — only manualReconnect() (or a fresh connect()) can revive it.
 */
function stopStream(): void {
  sse.close()
  streaming.value = false
}

/**
 * Triggered from the failed-state retry button or the toast retry action.
 * Reuses useSSE.manualReconnect which resets attempt counters and re-runs
 * start() with the previously-supplied options.
 */
function retryStream(): void {
  appendLine('[INFO] 手動重新連線…')
  sse.manualReconnect()
}

// ---------------------------------------------------------------------------
// Watch terminal failure → notify the user once and offer a retry action.
// ---------------------------------------------------------------------------

watch(
  () => sse.isFailed.value,
  (failed) => {
    if (!failed || !streaming.value) return
    appendLine('[ERROR] 重連次數已達上限，請手動重試或重新開始監看')
    showToast('日誌串流連線中斷，重連已達上限', 'error', {
      retryFn: () => retryStream(),
    })
  },
)

// ---------------------------------------------------------------------------
// Pause / resume
// ---------------------------------------------------------------------------

function togglePause(): void {
  if (paused.value) {
    resumeFromPause()
  } else {
    paused.value = true
  }
}

function resumeFromPause(): void {
  paused.value = false
  // Flush queued entries into the visible buffer
  const queued = pauseQueue.value.splice(0)
  for (const entry of queued) {
    logBuffer.value.push(entry)
  }
  // Trim buffer if it grew past max
  if (logBuffer.value.length > LOG_BUFFER_MAX) {
    logBuffer.value.splice(0, logBuffer.value.length - LOG_BUFFER_MAX)
  }
  nextTick(() => {
    if (!userScrolledUp.value) {
      scrollToBottom()
    } else {
      hasNewMessages.value = true
    }
  })
}

// ---------------------------------------------------------------------------
// Export / download
// ---------------------------------------------------------------------------

function exportLogs(): void {
  const lines = visibleLines.value.map((entry) => {
    const prefix = showTimestamp.value ? `[${formatTs(entry.ts)}] ` : ''
    return prefix + entry.line
  })
  if (lines.length === 0) {
    showToast('沒有可匯出的日誌', 'info')
    return
  }
  if (paused.value && pauseQueue.value.length > 0) {
    showToast(`暫停中有 ${pauseQueue.value.length} 行尚未納入匯出`, 'info')
  }
  const blob = new Blob([lines.join('\n') + '\n'], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const now = new Date()
  const pad2 = (n: number) => String(n).padStart(2, '0')
  const filename = `openclaw-logs-${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}-${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}.log`
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  // Firefox processes blob URL asynchronously after click; defer revoke
  // so the download doesn't race with URL invalidation.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
  showToast(`已匯出 ${lines.length} 行日誌`, 'success')
}

function clearLog(): void {
  logBuffer.value = [{ id: ++_entrySeq, line: '日誌已清除', level: 'info', cls: 'info', ts: Date.now() }]
  pauseQueue.value = []
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
      <div class="log-filter-bar">
        <button class="ctrl-btn" @click="toggleStream">
          {{ streaming ? '⏹ 停止監看' : '▶ 開始監看' }}
        </button>
        <button
          v-if="streaming"
          :class="['ctrl-btn', { 'ctrl-btn-active': paused }]"
          @click="togglePause"
        >
          {{ paused ? '▶ 繼續' : '⏸ 暫停' }}
        </button>
        <button class="ctrl-btn" @click="clearLog">🗑 清除</button>
        <button class="ctrl-btn" @click="exportLogs">💾 匯出</button>
        <button
          :class="['ctrl-btn', { 'ctrl-btn-active': showTimestamp }]"
          @click="showTimestamp = !showTimestamp"
          title="切換時間戳顯示"
        >
          🕐
        </button>
        <input
          v-model="filterText"
          class="log-search-input"
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
    <div style="padding:4px 0;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <span
        :class="[
          'oc-log-badge',
          {
            live: connectionStatus === 'live',
            reconnecting: connectionStatus === 'reconnecting',
            failed: connectionStatus === 'failed',
          },
        ]"
      >
        {{ STATUS_LABELS[connectionStatus] }}
        <template v-if="connectionStatus === 'reconnecting' && reconnectAttempt > 0">
          （第 {{ reconnectAttempt }} 次）
        </template>
      </span>
      <button
        v-if="connectionStatus === 'failed'"
        class="ctrl-btn"
        style="font-size:11px;padding:2px 8px"
        @click="retryStream"
      >
        🔄 重試連線
      </button>
      <span v-if="paused" class="oc-log-badge" style="background:var(--color-warn,#f59e0b);color:#000">
        ⏸ 已暫停（{{ pauseQueue.length }} 行待處理）
      </span>
    </div>

    <!-- Terminal -->
    <div
      ref="terminalRef"
      class="oc-log-terminal"
      @scroll="onScroll"
    >
      <div
        v-for="entry in visibleLines"
        :key="entry.id"
        :class="['log-line', entry.level, 'oc-log-line', entry.cls]"
      >
        <span v-if="showTimestamp" class="oc-log-ts">{{ formatTs(entry.ts) }}</span>
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
      class="log-scroll-bottom-btn"
      @click="scrollToBottom"
    >
      ⬇ 新訊息
    </button>
  </div>
</template>
