<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { getBasePath, api } from '@/composables/useApi'
import { showToast } from '@/composables/useToast'
import EmptyState from '@/components/EmptyState.vue'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Phase = 'idle' | 'running' | 'cooldown' | 'done' | 'error'

interface HistoryEntry {
  filename: string
  date: string
  size_bytes: number
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const phase = ref<Phase>('idle')
const currentStep = ref(0)
const currentMsg = ref('')
const cooldownMin = ref(0)
const resultFilename = ref('')
const resultSummary = ref('')
const opusFailed = ref(false)
const errorMsg = ref('')

// History state
const history = ref<HistoryEntry[]>([])
const historyLoading = ref(false)
const historyError = ref('')

// Viewer state
const viewingFilename = ref('')
const viewingContent = ref('')
const viewLoading = ref(false)
const viewError = ref('')

let es: EventSource | null = null
let cooldownTimer: ReturnType<typeof setInterval> | null = null

// ---------------------------------------------------------------------------
// Computed
// ---------------------------------------------------------------------------

const canRun = computed(
  () => phase.value === 'idle' || phase.value === 'done' || phase.value === 'error',
)
const progressPct = computed(() => Math.round((currentStep.value / 7) * 100))

// ---------------------------------------------------------------------------
// EventSource helpers
// ---------------------------------------------------------------------------

function closeEventSource(): void {
  if (es) {
    es.close()
    es = null
  }
}

function clearCooldownTimer(): void {
  if (cooldownTimer !== null) {
    clearInterval(cooldownTimer)
    cooldownTimer = null
  }
}

function startCooldownCountdown(): void {
  clearCooldownTimer()
  cooldownTimer = setInterval(() => {
    cooldownMin.value = Math.max(0, cooldownMin.value - 1)
    if (cooldownMin.value <= 0) {
      clearCooldownTimer()
      phase.value = 'idle'
    }
  }, 60_000)
}

// ---------------------------------------------------------------------------
// Start optimization
// ---------------------------------------------------------------------------

function startOptimize(): void {
  // Reset state
  phase.value = 'running'
  currentStep.value = 0
  currentMsg.value = '啟動中...'
  resultFilename.value = ''
  resultSummary.value = ''
  opusFailed.value = false
  errorMsg.value = ''

  closeEventSource()
  clearCooldownTimer()

  const basePath = getBasePath()
  const url = (basePath || '') + '/api/optimize/run'
  es = new EventSource(url, { withCredentials: true })

  es.addEventListener('progress', (event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data as string) as { step?: number; msg?: string }
      currentStep.value = data.step ?? currentStep.value
      currentMsg.value = data.msg ?? ''
    } catch {
      // ignore parse error
    }
  })

  es.addEventListener('cooldown', (event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data as string) as { remaining?: number }
      cooldownMin.value = data.remaining ?? 0
      phase.value = 'cooldown'
      startCooldownCountdown()
      showToast(`優化冷卻中，約 ${cooldownMin.value} 分鐘後可再執行`, 'warning')
    } catch {
      // ignore
    }
    closeEventSource()
  })

  es.addEventListener('done', (event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data as string) as {
        filename?: string
        summary?: string
        opusFailed?: boolean
      }
      resultFilename.value = data.filename ?? ''
      resultSummary.value = data.summary ?? ''
      opusFailed.value = !!data.opusFailed
      phase.value = 'done'
      showToast('優化完成！', 'success')
    } catch {
      // ignore
    }
    closeEventSource()
  })

  es.addEventListener('error', (event: MessageEvent) => {
    // Named 'error' event from server (has event.data)
    if (event.data) {
      try {
        const data = JSON.parse(event.data as string) as { msg?: string }
        errorMsg.value = data.msg ?? '未知錯誤'
      } catch {
        errorMsg.value = '未知錯誤'
      }
      phase.value = 'error'
      showToast(`優化失敗：${errorMsg.value}`, 'error')
      closeEventSource()
    }
  })

  // EventSource native connection error
  es.onerror = () => {
    if (phase.value === 'running') {
      phase.value = 'error'
      errorMsg.value = '連線中斷'
      showToast('優化連線中斷', 'error')
    }
    closeEventSource()
  }
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

async function fetchHistory(): Promise<void> {
  historyLoading.value = true
  historyError.value = ''
  try {
    const data = await api.get('/api/optimize/history') as { history: HistoryEntry[] }
    history.value = data.history ?? []
  } catch {
    historyError.value = '無法載入過往報告'
  } finally {
    historyLoading.value = false
  }
}

async function viewPlan(filename: string): Promise<void> {
  viewingFilename.value = filename
  viewingContent.value = ''
  viewError.value = ''
  viewLoading.value = true
  try {
    const data = await api.get(`/api/optimize/result/${encodeURIComponent(filename)}`) as {
      filename: string
      content: string
    }
    viewingContent.value = data.content ?? ''
  } catch {
    viewError.value = '無法載入報告內容'
  } finally {
    viewLoading.value = false
  }
}

function closeViewer(): void {
  viewingFilename.value = ''
  viewingContent.value = ''
  viewError.value = ''
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Refetch history when a run completes
watch(phase, (newPhase) => {
  if (newPhase === 'done') {
    void fetchHistory()
  }
})

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

onMounted(() => {
  void fetchHistory()
})

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

onUnmounted(() => {
  closeEventSource()
  clearCooldownTimer()
})
</script>

<template>
  <div class="tab-content optimize-tab">
    <!-- Header -->
    <div class="optimize-header">
      <h2>🧠 自主優化</h2>
      <p class="optimize-desc">AI 驅動的自動成本 &amp; 效能優化 Pipeline</p>
    </div>

    <!-- Action card -->
    <div class="card optimize-action-card">
      <div class="optimize-action-row">
        <button
          class="btn btn-primary optimize-run-btn"
          :disabled="!canRun"
          @click="startOptimize"
        >
          <template v-if="phase === 'running'">⏳ 執行中...</template>
          <template v-else-if="phase === 'cooldown'">🕐 冷卻中 ({{ cooldownMin }}m)</template>
          <template v-else>🚀 開始優化</template>
        </button>
        <span v-if="phase === 'cooldown'" class="optimize-cooldown-hint">
          冷卻期間無法重複執行，約 {{ cooldownMin }} 分鐘後可再試
        </span>
      </div>

      <!-- Progress -->
      <div v-if="phase === 'running'" class="optimize-progress">
        <div class="optimize-progress-bar-track">
          <div
            class="optimize-progress-bar-fill"
            :style="{ width: progressPct + '%' }"
          ></div>
        </div>
        <div class="optimize-progress-info">
          <span class="optimize-step">Step {{ currentStep }}/7</span>
          <span class="optimize-msg">{{ currentMsg }}</span>
        </div>
      </div>
    </div>

    <!-- Result card -->
    <div v-if="phase === 'done'" class="card optimize-result-card">
      <h3>✅ 優化報告</h3>
      <div v-if="opusFailed" class="optimize-warning">
        ⚠️ Opus 模型呼叫失敗，使用 fallback 結果
      </div>
      <div class="optimize-result-meta">
        <span class="optimize-result-label">檔案：</span>
        <code>{{ resultFilename }}</code>
      </div>
      <div v-if="resultSummary" class="optimize-result-summary">
        <span class="optimize-result-label">摘要：</span>
        <span>{{ resultSummary }}</span>
      </div>
    </div>

    <!-- Error card -->
    <div v-if="phase === 'error'" class="card optimize-error-card">
      <h3>❌ 優化失敗</h3>
      <p>{{ errorMsg }}</p>
      <button class="btn btn-secondary" @click="startOptimize">重試</button>
    </div>

    <!-- History card -->
    <div class="card optimize-history-card">
      <h3>📋 過往報告</h3>
      <div v-if="historyLoading" class="optimize-history-loading">載入中...</div>
      <div v-else-if="historyError" class="optimize-history-error">{{ historyError }}</div>
      <EmptyState v-else-if="history.length === 0" variant="generic" title="尚無過往報告" />
      <ul v-else class="optimize-history-list">
        <li
          v-for="entry in history"
          :key="entry.filename"
          class="optimize-history-item"
          :class="{ active: viewingFilename === entry.filename }"
          @click="viewPlan(entry.filename)"
        >
          <span class="optimize-history-date">{{ entry.date }}</span>
          <span class="optimize-history-filename">{{ entry.filename }}</span>
          <span class="optimize-history-size">{{ formatSize(entry.size_bytes) }}</span>
        </li>
      </ul>

      <!-- Inline viewer -->
      <div v-if="viewingFilename" class="optimize-viewer">
        <div class="optimize-viewer-header">
          <span class="optimize-viewer-title">{{ viewingFilename }}</span>
          <button class="btn btn-secondary optimize-viewer-close" @click="closeViewer">✕ 關閉</button>
        </div>
        <div v-if="viewLoading" class="optimize-viewer-loading">載入中...</div>
        <div v-else-if="viewError" class="optimize-viewer-error">{{ viewError }}</div>
        <pre v-else class="optimize-viewer-content">{{ viewingContent }}</pre>
      </div>
    </div>

    <!-- Idle info card -->
    <div v-if="phase === 'idle'" class="card optimize-info-card">
      <h3>ℹ️ 說明</h3>
      <ul class="optimize-steps-list">
        <li>Step 1 — 收集系統數據（費用、agents、告警）</li>
        <li>Step 2-4 — AI 多階段分析（草案 → 審查 → 程式碼審查）</li>
        <li>Step 5-6 — 整合與保存報告</li>
        <li>Step 7 — 發送通知</li>
      </ul>
      <p class="optimize-note">每次執行後有 10 分鐘冷卻期</p>
    </div>
  </div>
</template>

<style scoped>
.optimize-tab {
  padding: 20px;
  max-width: 800px;
}

.optimize-header {
  margin-bottom: 20px;
}

.optimize-header h2 {
  margin: 0 0 4px;
}

.optimize-desc {
  color: var(--text-muted);
  font-size: 14px;
  margin: 0;
}

.optimize-action-card {
  padding: 20px;
}

.optimize-action-row {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.optimize-run-btn {
  min-width: 160px;
  font-size: 15px;
  padding: 10px 20px;
}

.optimize-cooldown-hint {
  color: var(--text-muted);
  font-size: 13px;
}

.optimize-progress {
  margin-top: 16px;
}

.optimize-progress-bar-track {
  height: 8px;
  background: var(--bg-secondary, #e5e7eb);
  border-radius: 4px;
  overflow: hidden;
}

.optimize-progress-bar-fill {
  height: 100%;
  background: var(--accent, #3b82f6);
  border-radius: 4px;
  transition: width 0.4s ease;
}

.optimize-progress-info {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
  font-size: 13px;
}

.optimize-step {
  font-weight: 600;
}

.optimize-msg {
  color: var(--text-muted);
}

.optimize-result-card {
  padding: 20px;
  margin-top: 16px;
}

.optimize-result-card h3 {
  margin: 0 0 12px;
}

.optimize-warning {
  background: var(--warning-bg, #fef3c7);
  color: var(--warning-text, #92400e);
  padding: 8px 12px;
  border-radius: 6px;
  margin-bottom: 12px;
  font-size: 13px;
}

.optimize-result-meta {
  margin-bottom: 8px;
}

.optimize-result-label {
  font-weight: 600;
  margin-right: 4px;
}

.optimize-result-summary {
  color: var(--text-secondary);
}

.optimize-error-card {
  padding: 20px;
  margin-top: 16px;
  border-left: 4px solid var(--danger, #ef4444);
}

.optimize-error-card h3 {
  margin: 0 0 8px;
}

.optimize-error-card p {
  margin: 0 0 12px;
  color: var(--text-secondary);
}

.optimize-info-card {
  padding: 20px;
  margin-top: 16px;
}

.optimize-info-card h3 {
  margin: 0 0 12px;
}

.optimize-steps-list {
  margin: 0 0 12px;
  padding-left: 20px;
}

.optimize-steps-list li {
  margin-bottom: 4px;
  font-size: 14px;
  color: var(--text-secondary);
}

.optimize-note {
  color: var(--text-muted);
  font-size: 13px;
  margin: 0;
}

/* History card */
.optimize-history-card {
  padding: 20px;
  margin-top: 16px;
}

.optimize-history-card h3 {
  margin: 0 0 12px;
}

.optimize-history-loading,
.optimize-history-error,
.optimize-history-empty {
  font-size: 14px;
  color: var(--text-muted);
  padding: 8px 0;
}

.optimize-history-error {
  color: var(--danger, #ef4444);
}

.optimize-history-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.optimize-history-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  border: 1px solid transparent;
  transition: background 0.15s;
}

.optimize-history-item:hover,
.optimize-history-item.active {
  background: var(--bg-secondary, #f3f4f6);
  border-color: var(--border, #e5e7eb);
}

.optimize-history-date {
  font-weight: 600;
  min-width: 90px;
}

.optimize-history-filename {
  flex: 1;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.optimize-history-size {
  color: var(--text-muted);
  min-width: 60px;
  text-align: right;
}

/* Inline viewer */
.optimize-viewer {
  margin-top: 16px;
  border-top: 1px solid var(--border, #e5e7eb);
  padding-top: 16px;
}

.optimize-viewer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  gap: 12px;
}

.optimize-viewer-title {
  font-weight: 600;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.optimize-viewer-close {
  flex-shrink: 0;
  font-size: 12px;
  padding: 4px 10px;
}

.optimize-viewer-loading,
.optimize-viewer-error {
  font-size: 14px;
  color: var(--text-muted);
  padding: 8px 0;
}

.optimize-viewer-error {
  color: var(--danger, #ef4444);
}

.optimize-viewer-content {
  background: var(--bg-secondary, #f9fafb);
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 6px;
  padding: 16px;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 480px;
  overflow-y: auto;
  margin: 0;
}
</style>
