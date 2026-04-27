<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'
import { api } from '@/composables/useApi'
import { appState } from '@/stores/appState'
import { formatTokens, formatTWD, getAgentEmoji, getStatusInfo } from '@/utils/format'
import SessionViewer from '@/components/SessionViewer.vue'
import Skeleton from '@/components/Skeleton.vue'
import { showToast } from '@/composables/useToast'
import { useAgentAliases } from '@/composables/useAgentAliases'

// ── History trend ─────────────────────────────────────────────────────────────

interface HistoryPoint {
  timestamp: string
  cost: number
  input_tokens: number
  output_tokens: number
}

const props = defineProps<{
  agentId: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'chat', agentId: string): void
  (e: 'model-switch', agentId: string, model: string): void
}>()

// ── Agent alias (rename) ──────────────────────────────────────────────────────

const { getAlias, setAlias, displayName } = useAgentAliases()

const isRenaming = ref(false)
const editingAlias = ref('')
const renameInputRef = ref<HTMLInputElement | null>(null)

const currentDisplayName = computed(() => displayName(props.agentId))

function startRename(): void {
  editingAlias.value = getAlias(props.agentId) ?? ''
  isRenaming.value = true
  nextTick(() => {
    renameInputRef.value?.focus()
    renameInputRef.value?.select()
  })
}

function commitRename(): void {
  if (!isRenaming.value) return
  isRenaming.value = false
  setAlias(props.agentId, editingAlias.value)
  const name = editingAlias.value.trim()
  if (name) {
    showToast(`已更名: ${name}`, 'success')
  } else {
    showToast('已清除別名', 'info')
  }
}

function cancelRename(): void {
  isRenaming.value = false
  editingAlias.value = ''
}

// ── Session list ──────────────────────────────────────────────────────────────

interface SessionSummary {
  id: string
  messageCount: number
  lastTs?: string
  createdAt?: number | string | null
  preview?: string | null
  title?: string | null
  firstMessage?: string | null
}

const sessions = ref<SessionSummary[]>([])
const sessionsLoading = ref(true)
const sessionsError = ref(false)
const activeSessionId = ref('')

async function loadSessions() {
  sessionsLoading.value = true
  sessionsError.value = false
  try {
    const data = (await api.get(
      `/api/agents/${encodeURIComponent(props.agentId)}/sessions`
    )) as { success?: boolean; sessions?: SessionSummary[] }
    sessions.value = data?.sessions ?? []
  } catch {
    sessions.value = []
    sessionsError.value = true
    showToast('Session 列表載入失敗', 'error')
  } finally {
    sessionsLoading.value = false
  }
}

onMounted(() => {
  loadSessions()
  fetchAgentHistory()
  refreshBookmarks()
})

function openSession(sessionId: string) {
  activeSessionId.value = sessionId
}

// ── Agent data from shared state ──────────────────────────────────────────────

const agent = computed(() => {
  const agents = appState.latestDashboard?.agents ?? []
  return agents.find((a) => a.id === props.agentId) ?? null
})

// M4: use Record<string, unknown> to safely access extended fields the typed
// Agent interface doesn't declare, without an unsafe intersection with nullable
function agentExt(): Record<string, unknown> {
  return (agent.value ?? {}) as Record<string, unknown>
}

function getAgentCostTWD(): string {
  const a = agentExt()
  const costs = a['costs'] as Record<string, unknown> | undefined
  const usd = parseFloat(String(costs?.['month'] ?? costs?.['total'] ?? a['cost'] ?? a['costUSD'] ?? 0))
  return formatTWD(usd, appState.currentExchangeRate)
}

function getTokenField(field: string): number {
  const a = agentExt()
  const tokens = a['tokens'] as Record<string, unknown> | undefined
  return Number(tokens?.[field] ?? 0)
}

function getLastActivity(): string {
  const a = agentExt()
  return String(a['lastActivity'] ?? '-')
}

const history = ref<HistoryPoint[]>([])
const historyLoading = ref(true)
const historyError = ref(false)

async function fetchAgentHistory() {
  historyLoading.value = true
  historyError.value = false
  try {
    const data = (await api.get(
      `/api/agents/${encodeURIComponent(props.agentId)}/history?hours=24`
    )) as { success?: boolean; history?: HistoryPoint[] }
    history.value = data?.history ?? []
  } catch {
    history.value = []
    historyError.value = true
  } finally {
    historyLoading.value = false
  }
}

const totalCost24h = computed<number>(() =>
  history.value.reduce((sum, p) => sum + (p.cost ?? 0), 0)
)

const totalTokens24h = computed<number>(() =>
  history.value.reduce((sum, p) => sum + (p.input_tokens ?? 0) + (p.output_tokens ?? 0), 0)
)

const maxCost = computed<number>(() => {
  const costs = history.value.map((p) => p.cost ?? 0)
  return Math.max(...costs, 0.000001)
})

function histBarWidth(cost: number): string {
  return ((cost / maxCost.value) * 100).toFixed(1) + '%'
}

function fmtHistTs(ts: string): string {
  try {
    const d = new Date(ts)
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    return `${hh}:${mm}`
  } catch {
    return ts.slice(-5)
  }
}

// ── Diagnose ──────────────────────────────────────────────────────────────────

import { diagnoseAgent, type DiagnosticFinding } from '@/utils/agentDiagnose'

const diagnoseFindings = ref<DiagnosticFinding[] | null>(null)

function severityIcon(sev: string): string {
  if (sev === 'critical') return '🔴'
  if (sev === 'warning') return '🟠'
  if (sev === 'info') return '🔵'
  return '✅'
}

function runDiagnose(): void {
  diagnoseFindings.value = diagnoseAgent({
    agent: agent.value ?? {},
    sessions: sessions.value,
    history: history.value,
  })
}

// ── Session search ────────────────────────────────────────────────────────────

import { filterSessionsByQuery } from '@/utils/sessionSearchFilter'

const sessionSearchQuery = ref('')
const sessionsBookmarkedOnly = ref(false)

const filteredSessions = computed(() => {
  let result = filterSessionsByQuery(sessions.value, sessionSearchQuery.value)
  if (sessionsBookmarkedOnly.value) {
    result = result.filter((s) => bookmarks.value.includes(s.id))
  }
  // Sort by createdAt before bookmark partition so pinned order reflects chosen direction
  result = [...result].sort((a, b) => {
    const ta = a.createdAt != null ? Number(a.createdAt) : 0
    const tb = b.createdAt != null ? Number(b.createdAt) : 0
    return sessionsSortOrder.value === 'desc' ? tb - ta : ta - tb
  })
  return result
})

// ── Session bookmarks ─────────────────────────────────────────────────────────

import { loadBookmarks, toggleBookmark, partition } from '@/utils/sessionBookmarks'
import { loadSessionsSortOrder, saveSessionsSortOrder, type SortOrder } from '@/utils/sessionsSortPref'
import { buildSessionsCsv } from '@/utils/sessionsCsvExport'
import { buildSessionsJson } from '@/utils/sessionsJsonExport'
import { buildSessionsMarkdown } from '@/utils/sessionsMarkdownExport'
import AgentNotes from '@/components/AgentNotes.vue'
import AgentStatsCard from '@/components/AgentStatsCard.vue'
import { computeAgentStats, type AgentStats } from '@/utils/agentStats'
import { loadNote } from '@/utils/agentNotes'
import { useQuickCapture } from '@/composables/useQuickCapture'
import SessionsInsights from '@/components/SessionsInsights.vue'
import { computeSessionsInsights } from '@/utils/sessionsInsights'

const bookmarks = ref<string[]>([])
const showSessionsInsights = ref(false)
const sessionsSortOrder = ref<SortOrder>(loadSessionsSortOrder())

function toggleSessionsSort(): void {
  sessionsSortOrder.value = sessionsSortOrder.value === 'desc' ? 'asc' : 'desc'
  saveSessionsSortOrder(sessionsSortOrder.value)
}

function refreshBookmarks() {
  bookmarks.value = loadBookmarks(props.agentId)
}

const sessionsInsights = computed(() =>
  computeSessionsInsights(sessions.value, bookmarks.value),
)

function onToggleBookmark(sessionId: string) {
  bookmarks.value = toggleBookmark(props.agentId, sessionId)
}

function exportSessionsCsv(): void {
  const { filename, content } = buildSessionsCsv(
    props.agentId,
    sessions.value,
    bookmarks.value,
  )
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
  showToast(`已匯出 ${sessions.value.length} 筆 session`, 'success')
}

function exportSessionsJson(): void {
  const { filename, content } = buildSessionsJson(
    props.agentId,
    sessions.value,
    bookmarks.value,
  )
  const blob = new Blob([content], { type: 'application/json;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
  showToast(`已匯出 ${sessions.value.length} 筆 session (JSON)`, 'success')
}

function exportSessionsMarkdown(): void {
  const { filename, content } = buildSessionsMarkdown(
    props.agentId,
    currentDisplayName.value,
    sessions.value,
    bookmarks.value,
  )
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
  showToast(`已匯出 ${sessions.value.length} 筆 session (Markdown)`, 'success')
}

const partitionedSessions = computed(() => partition(filteredSessions.value, bookmarks.value))

// ── Agent stats card ──────────────────────────────────────────────────────────

const { captures, pinnedIds } = useQuickCapture()

const agentStats = computed<AgentStats>(() => {
  const note = loadNote(props.agentId)
  return computeAgentStats({
    agentId: props.agentId,
    displayName: currentDisplayName.value,
    bookmarks: bookmarks.value,
    captures: captures.value,
    pinnedIds: pinnedIds.value,
    notesText: note?.text ?? '',
  })
})

// ── Model usage ───────────────────────────────────────────────────────────────

interface ModelUsageEntry {
  sessions: number
  total: number
  cost: number
}

const modelUsageList = computed<[string, ModelUsageEntry][]>(() => {
  const a = agentExt()
  const mu = a['modelUsage'] as Record<string, ModelUsageEntry> | undefined
  if (!mu) return []
  return Object.entries(mu).sort((x, y) => y[1].cost - x[1].cost)
})
</script>

<template>
  <div>
    <!-- Section header with back button -->
    <div class="section-header">
      <button class="ctrl-btn" @click="$emit('close')">← 返回</button>
      <div class="agent-detail-title">
        <span class="agent-detail-emoji">{{ getAgentEmoji(agentId) }}</span>
        <template v-if="!isRenaming">
          <h2 :title="agentId" class="agent-detail-name">{{ currentDisplayName }}</h2>
          <button
            class="rename-btn"
            title="重新命名此 Agent"
            aria-label="重新命名此 Agent"
            @click="startRename"
          >✏️</button>
        </template>
        <template v-else>
          <input
            ref="renameInputRef"
            v-model="editingAlias"
            class="rename-input"
            :placeholder="agentId"
            maxlength="40"
            @keydown.enter="commitRename"
            @keydown.esc="cancelRename"
            @blur="commitRename"
          />
        </template>
        <small v-if="currentDisplayName !== agentId" class="agent-detail-original-id" :title="agentId">
          {{ agentId }}
        </small>
      </div>
    </div>

    <div id="detailContent">
      <!-- Basic Info Card -->
      <div class="detail-card">
        <div class="detail-card-title">基本資訊</div>
        <div class="detail-row">
          <span class="detail-row-label">Agent</span>
          <span class="detail-row-value" :title="agentId">{{ currentDisplayName }}</span>
        </div>
        <div class="detail-row">
          <span class="detail-row-label">狀態</span>
          <span :class="['detail-row-value', 'agent-status', getStatusInfo(agent?.status ?? 'offline').dotClass]">
            <span class="agent-status-dot"></span>
            {{ getStatusInfo(agent?.status ?? 'offline').text }}
          </span>
        </div>
        <div class="detail-row">
          <span class="detail-row-label">模型</span>
          <span class="detail-row-value">{{ agent?.model || 'N/A' }}</span>
        </div>
        <div class="detail-row">
          <span class="detail-row-label">最後活動</span>
          <span class="detail-row-value">{{ getLastActivity() }}</span>
        </div>
        <div class="detail-row">
          <span class="detail-row-label">費用</span>
          <span class="detail-row-value" style="color:var(--green)">{{ getAgentCostTWD() }}</span>
        </div>
      </div>

      <!-- Stats Card -->
      <div class="detail-card">
        <div class="detail-card-title">統計</div>
        <AgentStatsCard :stats="agentStats" />
      </div>

      <!-- Token Card -->
      <div class="detail-card">
        <div class="detail-card-title">Token</div>
        <div class="detail-row">
          <span class="detail-row-label">Input</span>
          <span class="detail-row-value">{{ formatTokens(getTokenField('input')) }}</span>
        </div>
        <div class="detail-row">
          <span class="detail-row-label">Output</span>
          <span class="detail-row-value">{{ formatTokens(getTokenField('output')) }}</span>
        </div>
        <div class="detail-row">
          <span class="detail-row-label">Cache</span>
          <span class="detail-row-value">{{ formatTokens(getTokenField('cacheRead')) }}</span>
        </div>
        <div class="detail-row">
          <span class="detail-row-label">Total</span>
          <span class="detail-row-value">{{ formatTokens(getTokenField('total')) }}</span>
        </div>
      </div>

      <!-- Model Usage Card -->
      <div v-if="modelUsageList.length" class="detail-card">
        <div class="detail-card-title">模型明細</div>
        <div v-for="[model, usage] of modelUsageList" :key="model" class="model-usage-item">
          <div>
            <span class="model-usage-name">{{ model }}</span>
            <span class="model-usage-sessions">({{ usage.sessions }})</span>
          </div>
          <div class="model-usage-stats">
            <div class="model-usage-tokens">{{ formatTokens(usage.total) }}</div>
            <div class="model-usage-cost">{{ formatTWD(usage.cost, appState.currentExchangeRate) }}</div>
          </div>
        </div>
      </div>

      <!-- Current Task Card -->
      <div class="detail-card">
        <div class="detail-card-title">目前任務</div>
        <div class="detail-task-content">{{ agent?.currentTask?.task || '無' }}</div>
      </div>

      <!-- Notes Card -->
      <div class="detail-card">
        <div class="detail-card-title">📝 筆記</div>
        <AgentNotes :agentId="agentId" />
      </div>

      <!-- Action Buttons -->
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="ctrl-btn accent" style="flex:1" @click="$emit('chat', agentId)">💬 對話</button>
        <button class="ctrl-btn" style="flex:1" @click="$emit('model-switch', agentId, agent?.model || '')">🔄 切換模型</button>
      </div>

      <!-- Diagnose Card -->
      <div class="detail-card">
        <div class="detail-card-title">
          🩺 診斷
          <button type="button" class="ctrl-btn diagnose-run-btn" @click="runDiagnose">執行診斷</button>
        </div>
        <div v-if="diagnoseFindings === null" style="color:var(--text-muted);font-size:12px;padding:4px 0">
          點擊「執行診斷」分析此 agent 當前狀態
        </div>
        <div v-else>
          <div
            v-for="(f, i) in diagnoseFindings"
            :key="`${f.check}-${i}`"
            class="diagnose-finding"
          >
            <span class="diagnose-icon" aria-hidden="true">{{ severityIcon(f.severity) }}</span>
            <span class="diagnose-message">{{ f.message }}</span>
          </div>
        </div>
      </div>

      <!-- History Trend Card -->
      <div class="detail-card">
        <div class="detail-card-title">近 24h 趨勢</div>
        <div v-if="historyLoading" style="padding:4px 0">
          <Skeleton :rows="4" height="22px" />
        </div>
        <div v-else-if="historyError" style="color:var(--error);font-size:12px;padding:4px 0">
          ⚠️ 載入失敗
          <button type="button" class="btn-reset" style="text-decoration:underline;margin-left:4px;color:inherit" @click="fetchAgentHistory">重試</button>
        </div>
        <div v-else-if="history.length === 0" style="color:var(--text-muted);font-size:12px">尚無歷史資料</div>
        <div v-else>
          <div class="hist-summary">
            <span>費用 <strong style="color:var(--green)">{{ formatTWD(totalCost24h, appState.currentExchangeRate) }}</strong></span>
            <span>Tokens <strong>{{ formatTokens(totalTokens24h) }}</strong></span>
          </div>
          <div class="hist-list">
            <div
              v-for="point in history.slice(-24)"
              :key="point.timestamp"
              class="hist-item"
            >
              <span class="hist-ts">{{ fmtHistTs(point.timestamp) }}</span>
              <div class="hist-bar-track">
                <div class="hist-bar" :style="{ width: histBarWidth(point.cost) }"></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Sessions Card -->
      <div class="detail-card">
        <div class="sessions-card-header">
          <div class="detail-card-title">Sessions</div>
          <button
            v-if="sessions.length > 0"
            type="button"
            class="ctrl-btn si-toggle-btn"
            :aria-expanded="showSessionsInsights"
            :title="showSessionsInsights ? '隱藏統計' : '顯示統計'"
            @click="showSessionsInsights = !showSessionsInsights"
          >📊 統計</button>
          <button
            v-if="sessions.length > 0"
            type="button"
            class="ctrl-btn si-toggle-btn"
            title="匯出 Sessions CSV"
            @click="exportSessionsCsv"
          >📊 匯出 CSV</button>
          <button
            v-if="sessions.length > 0"
            type="button"
            class="ctrl-btn si-toggle-btn"
            title="匯出 Sessions JSON"
            @click="exportSessionsJson"
          >📥 匯出 JSON</button>
          <button
            v-if="sessions.length > 0"
            type="button"
            class="ctrl-btn si-toggle-btn"
            title="匯出 Sessions Markdown"
            @click="exportSessionsMarkdown"
          >📝 匯出 Markdown</button>
          <input
            v-if="sessions.length > 0"
            v-model="sessionSearchQuery"
            type="search"
            placeholder="搜尋 session..."
            class="session-search-input"
          >
          <button
            v-if="sessions.length > 0"
            type="button"
            class="sessions-bookmark-only-btn"
            :class="{ active: sessionsBookmarkedOnly }"
            :aria-pressed="sessionsBookmarkedOnly"
            :title="sessionsBookmarkedOnly ? '顯示全部 sessions' : '只看書籤 sessions'"
            @click="sessionsBookmarkedOnly = !sessionsBookmarkedOnly"
          >⭐ 只看書籤</button>
          <button
            v-if="sessions.length > 0"
            type="button"
            class="sessions-sort-btn"
            :title="sessionsSortOrder === 'desc' ? '目前：新→舊，點擊切換為舊→新' : '目前：舊→新，點擊切換為新→舊'"
            @click="toggleSessionsSort"
          >{{ sessionsSortOrder === 'desc' ? '↓ 新→舊' : '↑ 舊→新' }}</button>
        </div>
        <!-- Sessions Insights Panel -->
        <SessionsInsights v-if="showSessionsInsights" :insights="sessionsInsights" />
        <div v-if="sessionsLoading" style="padding:4px 0">
          <Skeleton :rows="4" height="22px" />
        </div>
        <div v-else-if="sessionsError" style="color:var(--error);font-size:12px;padding:4px 0">
          ⚠️ 載入失敗
          <button type="button" class="btn-reset" style="text-decoration:underline;margin-left:4px;color:inherit" @click="loadSessions">重試</button>
        </div>
        <div v-else-if="sessions.length === 0" style="color:var(--text-muted);font-size:12px">無 session 記錄</div>
        <div v-else>
          <div
            v-if="filteredSessions.length === 0 && (sessionSearchQuery.trim().length > 0 || sessionsBookmarkedOnly)"
            class="sessions-empty-search"
          >無符合 session</div>
          <!-- Pinned (bookmarked) sessions -->
          <template v-if="partitionedSessions.pinned.length > 0">
            <div
              v-for="s in partitionedSessions.pinned"
              :key="`pin-${s.id}`"
              class="session-row session-row--pinned"
              role="group"
            >
              <button
                type="button"
                class="btn-reset session-row-main"
                @click="openSession(s.id)"
              >
                <span class="detail-row-label" style="font-family:monospace;font-size:11px">{{ s.id.slice(-16) }}</span>
                <span class="detail-row-value" style="color:var(--text-muted);font-size:11px">
                  {{ s.messageCount }} 則{{ s.lastTs ? ' · ' + s.lastTs.slice(0, 10) : '' }}
                </span>
              </button>
              <span
                class="session-star session-star--on"
                role="button"
                tabindex="0"
                :title="'取消釘選'"
                :aria-pressed="true"
                @click.stop="onToggleBookmark(s.id)"
                @keydown.enter.stop="onToggleBookmark(s.id)"
                @keydown.space.stop.prevent="onToggleBookmark(s.id)"
              >★</span>
            </div>
            <div v-if="partitionedSessions.rest.length > 0" class="session-separator" aria-hidden="true"></div>
          </template>
          <!-- Rest of sessions -->
          <div
            v-for="s in partitionedSessions.rest"
            :key="s.id"
            class="session-row"
            role="group"
          >
            <button
              type="button"
              class="btn-reset session-row-main"
              @click="openSession(s.id)"
            >
              <span class="detail-row-label" style="font-family:monospace;font-size:11px">{{ s.id.slice(-16) }}</span>
              <span class="detail-row-value" style="color:var(--text-muted);font-size:11px">
                {{ s.messageCount }} 則{{ s.lastTs ? ' · ' + s.lastTs.slice(0, 10) : '' }}
              </span>
            </button>
            <span
              class="session-star"
              role="button"
              tabindex="0"
              :title="'釘選 session'"
              :aria-pressed="false"
              @click.stop="onToggleBookmark(s.id)"
              @keydown.enter.stop="onToggleBookmark(s.id)"
              @keydown.space.stop.prevent="onToggleBookmark(s.id)"
            >★</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Session Viewer Modal -->
    <SessionViewer
      v-if="activeSessionId"
      :agentId="agentId"
      :sessionId="activeSessionId"
      @close="activeSessionId = ''"
    />
  </div>
</template>

<style scoped>
.hist-summary {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 8px;
}

.hist-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.hist-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.hist-ts {
  font-family: monospace;
  font-size: 10px;
  color: var(--text-muted);
  min-width: 36px;
}

.hist-bar-track {
  flex: 1;
  height: 6px;
  background: var(--bg-secondary, #1e1e2e);
  border-radius: 3px;
  overflow: hidden;
}

.hist-bar {
  height: 100%;
  background: var(--blue, #89b4fa);
  border-radius: 3px;
  min-width: 2px;
  transition: width 0.2s ease;
}

.sessions-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
}

.sessions-card-header .detail-card-title {
  margin-bottom: 0;
}

.si-toggle-btn {
  font-size: 11px;
  padding: 2px 8px;
  flex-shrink: 0;
}

.session-search-input {
  flex: 1;
  min-width: 0;
  font-size: 11px;
  padding: 3px 7px;
  border-radius: 4px;
  border: 1px solid var(--border, #45475a);
  background: var(--bg-secondary, #1e1e2e);
  color: var(--text, #cdd6f4);
  outline: none;
  transition: border-color 0.15s ease;
}

.session-search-input::placeholder {
  color: var(--text-muted, #6c7086);
}

.session-search-input:focus {
  border-color: var(--blue, #89b4fa);
}

.diagnose-run-btn {
  margin-left: auto;
  font-size: 11px;
  padding: 2px 8px;
}
.detail-card-title {
  display: flex;
  align-items: center;
}
.diagnose-finding {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: 12px;
  line-height: 1.5;
  padding: 4px 0;
}
.diagnose-icon {
  flex-shrink: 0;
  font-size: 13px;
  line-height: 1.4;
}
.diagnose-message {
  flex: 1;
  color: var(--text-primary);
}
.session-row {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  border-radius: 4px;
  padding: 2px 4px;
  margin: -2px -4px;
}
.session-row:hover .session-star {
  visibility: visible;
}
.session-row--pinned {
  background: rgba(255, 215, 0, 0.06);
}
.session-row-main {
  flex: 1;
  display: flex;
  text-align: left;
}
.session-star {
  cursor: pointer;
  user-select: none;
  font-size: 14px;
  padding: 0 6px;
  color: var(--text-muted);
  visibility: hidden;
  flex-shrink: 0;
}
.session-star--on {
  visibility: visible;
  color: gold;
}
.session-separator {
  margin: 6px 0;
  border-top: 1px dashed var(--border-color, rgba(0,0,0,0.15));
  opacity: 0.6;
}
.sessions-empty-search {
  font-size: 12px;
  color: var(--text-muted, #6c7086);
  padding: 4px 0;
}

/* ── Agent rename UI ──────────────────────────────────────────────────────── */
.agent-detail-title {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
}
.agent-detail-emoji {
  flex-shrink: 0;
}
.agent-detail-name {
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.agent-detail-original-id {
  font-size: 11px;
  color: var(--text-muted, #6c7086);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-shrink: 1;
}
.rename-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  padding: 2px 4px;
  opacity: 0.4;
  transition: opacity 0.15s;
  flex-shrink: 0;
}
.rename-btn:hover {
  opacity: 1;
}
.rename-input {
  font-size: inherit;
  font-family: inherit;
  background: var(--bg-card, rgba(0,0,0,0.15));
  border: 1px solid var(--accent, #7c3aed);
  border-radius: 4px;
  color: inherit;
  padding: 2px 6px;
  min-width: 0;
  width: 180px;
  outline: none;
}

/* ── Sessions bookmarked-only toggle ─────────────────────────────── */

.sessions-bookmark-only-btn {
  padding: 3px 9px;
  font-size: 11px;
  border: 1px solid var(--border, rgba(255, 255, 255, 0.12));
  border-radius: 5px;
  background: transparent;
  color: var(--text-muted, #94a3b8);
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition:
    background 0.15s,
    color 0.15s,
    border-color 0.15s;
}

.sessions-bookmark-only-btn:hover {
  background: var(--surface2, rgba(255, 255, 255, 0.07));
  color: var(--text, #e2e8f0);
  border-color: var(--accent, #6366f1);
}

.sessions-bookmark-only-btn.active {
  background: var(--accent, #6366f1);
  border-color: var(--accent, #6366f1);
  color: #fff;
}

/* ── Sessions sort toggle ─────────────────────────────────────────── */

.sessions-sort-btn {
  padding: 3px 9px;
  font-size: 11px;
  border: 1px solid var(--border, rgba(255, 255, 255, 0.12));
  border-radius: 5px;
  background: transparent;
  color: var(--text-muted, #94a3b8);
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition:
    background 0.15s,
    color 0.15s,
    border-color 0.15s;
}

.sessions-sort-btn:hover {
  background: var(--surface2, rgba(255, 255, 255, 0.07));
  color: var(--text, #e2e8f0);
  border-color: var(--accent, #6366f1);
}
</style>
