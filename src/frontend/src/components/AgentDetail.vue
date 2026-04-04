<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { api } from '@/composables/useApi'
import { appState } from '@/stores/appState'
import { formatTokens, formatTWD, getAgentEmoji, getStatusInfo } from '@/utils/format'
import SessionViewer from '@/components/SessionViewer.vue'

const props = defineProps<{
  agentId: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'chat', agentId: string): void
  (e: 'model-switch', agentId: string, model: string): void
}>()

// ── Session list ──────────────────────────────────────────────────────────────

interface SessionSummary {
  id: string
  messageCount: number
  lastTs?: string
}

const sessions = ref<SessionSummary[]>([])
const sessionsLoading = ref(true)
const activeSessionId = ref('')

async function loadSessions() {
  sessionsLoading.value = true
  try {
    const data = (await api.get(
      `/api/agents/${encodeURIComponent(props.agentId)}/sessions`
    )) as { success?: boolean; sessions?: SessionSummary[] }
    sessions.value = data?.sessions ?? []
  } catch {
    sessions.value = []
  } finally {
    sessionsLoading.value = false
  }
}

onMounted(loadSessions)

function openSession(sessionId: string) {
  activeSessionId.value = sessionId
}

// ── Agent data from shared state ──────────────────────────────────────────────

const agent = computed(() => {
  const agents = appState.latestDashboard?.agents ?? []
  return agents.find((a) => a.id === props.agentId) ?? null
})

// Extended agent fields that backend may send beyond the typed interface
type AgentExt = typeof agent.value & Record<string, unknown>

function agentExt(): AgentExt {
  return (agent.value ?? {}) as AgentExt
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
      <h2>{{ getAgentEmoji(agentId) }} {{ agentId }}</h2>
    </div>

    <div id="detailContent">
      <!-- Basic Info Card -->
      <div class="detail-card">
        <div class="detail-card-title">基本資訊</div>
        <div class="detail-row">
          <span class="detail-row-label">Agent</span>
          <span class="detail-row-value">{{ agentId }}</span>
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

      <!-- Action Buttons -->
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="ctrl-btn accent" style="flex:1" @click="$emit('chat', agentId)">💬 對話</button>
        <button class="ctrl-btn" style="flex:1" @click="$emit('model-switch', agentId, agent?.model || '')">🔄 切換模型</button>
      </div>

      <!-- Sessions Card -->
      <div class="detail-card">
        <div class="detail-card-title">Sessions</div>
        <div v-if="sessionsLoading" style="color:var(--text-muted);font-size:12px;padding:4px 0">載入中…</div>
        <div v-else-if="sessions.length === 0" style="color:var(--text-muted);font-size:12px">無 session 記錄</div>
        <div v-else>
          <div
            v-for="s in sessions"
            :key="s.id"
            class="detail-row"
            style="cursor:pointer;border-radius:4px;padding:2px 4px;margin:-2px -4px"
            @click="openSession(s.id)"
          >
            <span class="detail-row-label" style="font-family:monospace;font-size:11px">{{ s.id.slice(-16) }}</span>
            <span class="detail-row-value" style="color:var(--text-muted);font-size:11px">
              {{ s.messageCount }} 則{{ s.lastTs ? ' · ' + s.lastTs.slice(0, 10) : '' }}
            </span>
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
