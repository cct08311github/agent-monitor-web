<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import { useSSE } from '@/composables/useSSE'
import { showToast } from '@/composables/useToast'
import { useDebouncedRef } from '@/composables/useDebouncedRef'
import { useLogPause } from '@/composables/useLogPause'
import { formatTs } from '@/lib/time'
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts'
import {
  loadSearches,
  saveSearch,
  deleteSearch,
  type SavedSearch,
} from '@/utils/savedSearches'
import { buildLogsJson } from '@/utils/logsJsonExport'
import { buildLogsCsv } from '@/utils/logsCsvExport'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LOG_BUFFER_MAX = 500
const SCROLL_THRESHOLD = 50
const STORAGE_KEY = 'oc_log_filter_presets'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LogLevel = 'error' | 'warn' | 'info'

interface FilterPreset {
  id: string
  name: string
  filterText: string
  regexMode: boolean
  errorOnly: boolean
  warnOnly: boolean
}

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
// Debounced mirror — filter/highlight only recompute after 200ms quiescence,
// so rapid typing does not trigger O(N) re-filter per keystroke on a 500-entry buffer.
const debouncedFilter = useDebouncedRef(filterText, 200)
const errorOnly = ref(false)
const warnOnly = ref(false)
const regexMode = ref(false)

/**
 * When regexMode is on and filterText is non-empty, attempt to compile it.
 * Returns the error message string if invalid, null otherwise.
 */
const regexError = computed<string | null>(() => {
  if (!regexMode.value || !debouncedFilter.value) return null
  try {
    new RegExp(debouncedFilter.value, 'i')
    return null
  } catch (e: unknown) {
    if (e instanceof Error) return `Invalid regex: ${e.message}`
    return 'Invalid regex'
  }
})

/**
 * Compiled RegExp for line matching (case-insensitive, no 'g' flag here
 * so it is safe to reuse across test() calls without lastIndex side-effects).
 */
const compiledRegex = computed<RegExp | null>(() => {
  if (!regexMode.value || !debouncedFilter.value || regexError.value !== null) return null
  return new RegExp(debouncedFilter.value, 'i')
})
const userScrolledUp = ref(false)
const hasNewMessages = ref(false)

/**
 * Paused mode: SSE stays connected but new lines are queued, not displayed.
 * Resume flushes the queue into the visible buffer.
 */
const {
  paused,
  pauseQueue,
  enqueue: enqueuePaused,
  drain: drainPauseQueue,
  reset: resetPauseQueue,
} = useLogPause<LogEntry>({ maxQueueSize: LOG_BUFFER_MAX })

/** Whether to show HH:mm:ss timestamp prefix on each log line */
const showTimestamp = ref(true)

// ---------------------------------------------------------------------------
// DOM refs
// ---------------------------------------------------------------------------

const terminalRef = ref<HTMLDivElement | null>(null)
const searchInputRef = ref<HTMLInputElement | null>(null)

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
  if (debouncedFilter.value) {
    if (regexMode.value) {
      // Invalid regex → treat as no-match (safer than showing all)
      if (regexError.value !== null) return false
      if (compiledRegex.value && !compiledRegex.value.test(line)) return false
    } else {
      if (!line.toLowerCase().includes(debouncedFilter.value.toLowerCase())) return false
    }
  }
  return true
}

/** Split a log line into segments for keyword highlighting. */
function buildSegments(line: string, keyword: string): Array<{ text: string; highlight: boolean }> {
  if (!keyword) return [{ text: line, highlight: false }]
  const segments: Array<{ text: string; highlight: boolean }> = []

  if (regexMode.value) {
    // In regex mode: use the compiled regex with 'g' flag for matchAll iteration.
    // If the regex is invalid or not compiled, fall back to no-highlight.
    if (regexError.value !== null || !compiledRegex.value) {
      return [{ text: line, highlight: false }]
    }
    // Re-create with 'gi' flags so matchAll works correctly.
    const re = new RegExp(compiledRegex.value.source, 'gi')
    let lastIndex = 0
    for (const match of line.matchAll(re)) {
      const start = match.index!
      const end = start + match[0].length
      // Avoid infinite loops from zero-length matches
      if (end === lastIndex) continue
      if (start > lastIndex) segments.push({ text: line.slice(lastIndex, start), highlight: false })
      segments.push({ text: line.slice(start, end), highlight: true })
      lastIndex = end
    }
    if (lastIndex < line.length) segments.push({ text: line.slice(lastIndex), highlight: false })
    if (segments.length === 0) segments.push({ text: line, highlight: false })
    return segments
  }

  // Substring mode (original logic)
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
    enqueuePaused(entry)
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
  const queued = drainPauseQueue()
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

function exportLogsJson(): void {
  if (visibleLines.value.length === 0) {
    showToast('沒有可匯出的日誌', 'info')
    return
  }
  if (paused.value && pauseQueue.value.length > 0) {
    showToast(`暫停中有 ${pauseQueue.value.length} 行尚未納入匯出`, 'info')
  }

  const level = errorOnly.value ? 'error' : warnOnly.value ? 'warn' : undefined
  const { filename, content } = buildLogsJson({
    entries: visibleLines.value.map((entry) => ({
      ts: entry.ts,
      level: entry.level,
      message: entry.line,
    })),
    filter: {
      query: filterText.value || undefined,
      level,
      regex: regexMode.value || undefined,
    },
  })

  const blob = new Blob([content], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  // Firefox processes blob URL asynchronously after click; defer revoke
  // so the download doesn't race with URL invalidation.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
  showToast(`已匯出 ${visibleLines.value.length} 筆 log`, 'success')
}

function exportLogsCsv(): void {
  if (visibleLines.value.length === 0) {
    showToast('沒有可匯出的日誌', 'info')
    return
  }
  if (paused.value && pauseQueue.value.length > 0) {
    showToast(`暫停中有 ${pauseQueue.value.length} 行尚未納入匯出`, 'info')
  }

  const { filename, content } = buildLogsCsv(
    visibleLines.value.map((entry) => ({
      ts: entry.ts,
      level: entry.level,
      message: entry.line,
    })),
  )

  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  // Firefox processes blob URL asynchronously after click; defer revoke
  // so the download doesn't race with URL invalidation.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
  showToast(`已匯出 ${visibleLines.value.length} 筆 log (CSV)`, 'success')
}

function clearLog(): void {
  logBuffer.value = [{ id: ++_entrySeq, line: '日誌已清除', level: 'info', cls: 'info', ts: Date.now() }]
  resetPauseQueue()
  hasNewMessages.value = false
}

// ---------------------------------------------------------------------------
// Filter presets
// ---------------------------------------------------------------------------

const presets = ref<FilterPreset[]>([])
const selectedPresetId = ref<string>('')

function persistPresets(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets.value))
  } catch {
    // localStorage write failure — silent
  }
}

function loadPresets(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as unknown
    if (Array.isArray(parsed)) {
      presets.value = parsed as FilterPreset[]
    }
  } catch {
    // Corrupt localStorage — silent fallback to empty
    presets.value = []
  }
}

function saveCurrentAsPreset(name: string): void {
  const trimmed = name.trim()
  if (!trimmed) return
  const newPreset: FilterPreset = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: trimmed,
    filterText: filterText.value,
    regexMode: regexMode.value,
    errorOnly: errorOnly.value,
    warnOnly: warnOnly.value,
  }
  presets.value = [...presets.value, newPreset]
  selectedPresetId.value = newPreset.id
  persistPresets()
  showToast(`已儲存 preset「${trimmed}」`, 'success')
}

function applyPreset(preset: FilterPreset): void {
  filterText.value = preset.filterText
  debouncedFilter.value = preset.filterText
  regexMode.value = preset.regexMode
  errorOnly.value = preset.errorOnly
  warnOnly.value = preset.warnOnly
  hasNewMessages.value = false
}

function deletePreset(id: string): void {
  presets.value = presets.value.filter((p) => p.id !== id)
  if (selectedPresetId.value === id) {
    selectedPresetId.value = ''
  }
  persistPresets()
}

function onPresetSelectChange(event: Event): void {
  const selectEl = event.target as HTMLSelectElement
  const id = selectEl.value
  if (!id) return
  selectedPresetId.value = id
  const preset = presets.value.find((p) => p.id === id)
  if (preset) applyPreset(preset)
}

function promptSavePreset(): void {
  const name = window.prompt('請輸入 preset 名稱：')
  if (name === null) return // cancelled
  if (!name.trim()) {
    showToast('Preset 名稱不得為空', 'error')
    return
  }
  saveCurrentAsPreset(name)
}

function deleteSelectedPreset(): void {
  if (!selectedPresetId.value) {
    showToast('請先選擇一個 preset', 'info')
    return
  }
  deletePreset(selectedPresetId.value)
  showToast('已刪除 preset', 'info')
}

// ---------------------------------------------------------------------------
// Saved searches (pill bar — localStorage key: oc_saved_log_searches)
// ---------------------------------------------------------------------------

const savedList = ref<SavedSearch[]>(loadSearches())

/** True when there is at least one search criterion worth saving */
const canSaveSearch = computed<boolean>(() => {
  return (
    filterText.value.trim().length > 0 ||
    errorOnly.value ||
    warnOnly.value
  )
})

function promptSaveSearch(): void {
  const name = window.prompt('請輸入搜尋名稱：')
  if (name === null) return // cancelled
  const trimmed = name.trim()
  if (!trimmed) {
    showToast('搜尋名稱不得為空', 'error')
    return
  }
  // Map LogsTab filter state → SavedSearch.level for clarity
  const level = errorOnly.value ? 'error' : warnOnly.value ? 'warn' : undefined
  saveSearch({
    name: trimmed,
    query: filterText.value,
    level,
  })
  savedList.value = loadSearches()
  showToast(`已儲存搜尋: ${trimmed}`, 'success')
}

function applySearch(s: SavedSearch): void {
  filterText.value = s.query
  debouncedFilter.value = s.query
  if (s.level === 'error') {
    errorOnly.value = true
    warnOnly.value = false
  } else if (s.level === 'warn') {
    warnOnly.value = true
    errorOnly.value = false
  } else {
    errorOnly.value = false
    warnOnly.value = false
  }
  hasNewMessages.value = false
}

function removeSearch(s: SavedSearch): void {
  deleteSearch(s.id)
  savedList.value = loadSearches()
  showToast(`已刪除: ${s.name}`, 'info')
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

function toggleRegexMode(): void {
  regexMode.value = !regexMode.value
  applyFilter()
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

const { registerShortcut } = useKeyboardShortcuts()

onMounted(() => {
  loadPresets()
  registerShortcut({
    key: '/',
    handler: () => {
      searchInputRef.value?.focus()
      searchInputRef.value?.select()
    },
    description: '聚焦搜尋',
    category: 'Actions',
  })
})

// ---------------------------------------------------------------------------
// Cleanup on unmount
// ---------------------------------------------------------------------------

onUnmounted(() => {
  stopStream()
})

// ---------------------------------------------------------------------------
// Test seam — expose internal state for unit tests
// ---------------------------------------------------------------------------

defineExpose({
  logBuffer,
  filterText,
  debouncedFilter,
  regexMode,
  regexError,
  compiledRegex,
  visibleLines,
  // preset seam
  presets,
  selectedPresetId,
  saveCurrentAsPreset,
  applyPreset,
  deletePreset,
  loadPresets,
  // saved-searches seam
  savedList,
  canSaveSearch,
  applySearch,
  removeSearch,
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
        <button class="ctrl-btn" @click="exportLogsJson">📥 匯出 JSON</button>
        <button class="ctrl-btn" @click="exportLogsCsv">📊 匯出 CSV</button>
        <button
          :class="['ctrl-btn', { 'ctrl-btn-active': showTimestamp }]"
          @click="showTimestamp = !showTimestamp"
          title="切換時間戳顯示"
        >
          🕐
        </button>
        <div class="log-search-wrap">
          <input
            ref="searchInputRef"
            v-model="filterText"
            :class="['log-search-input', { 'log-search-input--error': regexError !== null }]"
            placeholder="篩選..."
            @input="applyFilter"
          />
          <button
            :class="['log-filter-btn', 'regex', { active: regexMode }]"
            title="切換 Regex 模式"
            @click="toggleRegexMode"
          >
            .*
          </button>
          <div v-if="regexError !== null" class="log-regex-error">{{ regexError }}</div>
        </div>
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

        <!-- Filter Presets -->
        <div class="log-preset-wrap">
          <select
            class="log-preset-select"
            :value="selectedPresetId"
            @change="onPresetSelectChange"
            title="載入 preset"
          >
            <option value="" disabled>載入 preset...</option>
            <option
              v-for="preset in presets"
              :key="preset.id"
              :value="preset.id"
            >{{ preset.name }}</option>
          </select>
          <button
            class="ctrl-btn log-preset-btn"
            title="儲存目前篩選條件為 preset"
            @click="promptSavePreset"
          >
            💾 儲存
          </button>
          <button
            class="ctrl-btn log-preset-btn"
            :disabled="!selectedPresetId"
            title="刪除選取的 preset"
            @click="deleteSelectedPreset"
          >
            🗑️ 刪除
          </button>
        </div>

        <!-- Saved-search save button -->
        <button
          class="ctrl-btn log-save-search-btn"
          :disabled="!canSaveSearch"
          title="儲存目前搜尋為命名 preset"
          @click="promptSaveSearch"
        >
          🔖 儲存搜尋
        </button>
      </div>

      <!-- Saved-search pill bar -->
      <div
        v-if="savedList.length > 0"
        class="saved-search-pills"
        role="list"
        aria-label="已儲存的搜尋"
      >
        <button
          v-for="s in savedList"
          :key="s.id"
          class="saved-pill"
          role="listitem"
          :title="`套用: ${s.name}`"
          @click="applySearch(s)"
        >
          {{ s.name }}
          <span
            class="saved-pill-x"
            role="button"
            :aria-label="`刪除搜尋: ${s.name}`"
            @click.stop="removeSearch(s)"
          >✕</span>
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
          v-for="(seg, si) in buildSegments(entry.line, debouncedFilter)"
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

<style scoped>
.log-search-wrap {
  position: relative;
  display: inline-flex;
  flex-direction: column;
  align-items: flex-start;
}

.log-search-wrap .log-search-input {
  padding-right: 36px;
}

.log-search-input--error {
  border-color: var(--color-error, #ef4444) !important;
  outline-color: var(--color-error, #ef4444);
}

.log-filter-btn.regex {
  /* Absolute-position the .* badge inside the search wrap */
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 11px;
  font-family: monospace;
  padding: 1px 5px;
  line-height: 1;
  border-radius: 3px;
  opacity: 0.55;
  cursor: pointer;
}

.log-filter-btn.regex.active {
  opacity: 1;
  background: var(--color-accent, #6366f1);
  color: #fff;
  border-color: var(--color-accent, #6366f1);
}

.log-regex-error {
  position: absolute;
  top: calc(100% + 2px);
  left: 0;
  font-size: 11px;
  color: var(--color-error, #ef4444);
  white-space: nowrap;
  pointer-events: none;
  z-index: 10;
}

/* Preset controls */
.log-preset-wrap {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.log-preset-select {
  font-size: 12px;
  padding: 2px 6px;
  border: 1px solid var(--color-border, #3f3f46);
  border-radius: 4px;
  background: var(--color-surface, #18181b);
  color: var(--color-text, #e4e4e7);
  cursor: pointer;
  max-width: 140px;
}

.log-preset-btn {
  font-size: 11px;
  padding: 2px 7px;
}

.log-preset-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* Saved-search save button */
.log-save-search-btn {
  font-size: 11px;
  padding: 2px 7px;
}

.log-save-search-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* Saved-search pill bar */
.saved-search-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 6px 0 2px;
}

.saved-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px 2px 10px;
  font-size: 12px;
  border-radius: 999px;
  border: 1px solid var(--color-border, #3f3f46);
  background: var(--color-surface, #18181b);
  color: var(--color-text, #e4e4e7);
  cursor: pointer;
  white-space: nowrap;
  transition: background-color 120ms ease, border-color 120ms ease;
}

.saved-pill:hover {
  background: var(--color-surface-hover, #27272a);
  border-color: var(--color-accent, #6366f1);
}

.saved-pill-x {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  font-size: 10px;
  border-radius: 50%;
  opacity: 0;
  cursor: pointer;
  background: transparent;
  transition: opacity 100ms ease, background-color 100ms ease;
}

.saved-pill:hover .saved-pill-x {
  opacity: 1;
}

.saved-pill-x:hover {
  background: var(--color-error, #ef4444);
  color: #fff;
}

@media (prefers-reduced-motion: reduce) {
  .saved-pill,
  .saved-pill-x {
    transition: none;
  }
}
</style>
