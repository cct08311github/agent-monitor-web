<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { appState } from '@/stores/appState'
import { useDashboard } from '@/composables/useDashboard'
import { formatFreshnessLabel } from '@/lib/freshness'
import { useAgentOrder } from '@/composables/useAgentOrder'
import AgentMinimap from '@/components/AgentMinimap.vue'
import AgentFocus from '@/components/AgentFocus.vue'
import AgentPeriphery from '@/components/AgentPeriphery.vue'
import SubAgentGrid from '@/components/SubAgentGrid.vue'
import SummaryCards from '@/components/SummaryCards.vue'
import DailyDigestCard from '@/components/DailyDigestCard.vue'
import CronTab from '@/components/CronTab.vue'
import TaskHubTab from '@/components/TaskHubTab.vue'
import ObservabilityTab from '@/components/ObservabilityTab.vue'
import AgentCompareModal from '@/components/AgentCompareModal.vue'
import AgentConstellation from '@/components/AgentConstellation.vue'
import ActivityHeatmap from '@/components/ActivityHeatmap.vue'
import EmptyState from '@/components/EmptyState.vue'
import { useActivityAccumulator } from '@/composables/useActivityAccumulator'
import { useQuickCapture } from '@/composables/useQuickCapture'
import type { CompareAgentLike } from '@/utils/agentCompare'
import type { SubAgentLayout } from '@/utils/constellation'

const emit = defineEmits<{
  (e: 'agent-click', agentId: string): void
  (e: 'agent-chat', agentId: string): void
  (e: 'agent-model-switch', agentId: string, model: string): void
  (e: 'constellation-drill-down', subagent: SubAgentLayout): void
}>()

function onConstellationDrillDown(subagent: SubAgentLayout) {
  emit('constellation-drill-down', subagent)
}

// ── Sub-tab state ────────────────────────────────────────────────────────────

type SubTab = 'agents' | 'subagents' | 'cron' | 'taskhub' | 'observability' | 'constellation'

const VALID_SUB_TABS: readonly SubTab[] = ['agents', 'subagents', 'cron', 'taskhub', 'observability', 'constellation']

function isValidSubTab(v: unknown): v is SubTab {
  return typeof v === 'string' && (VALID_SUB_TABS as string[]).includes(v)
}

const activeSubTab = ref<SubTab>('agents')

// ── preferredMonitorSubTab — cross-component navigation ──────────────────────

onMounted(() => {
  // Handle value already set before MonitorTab mounted (e.g., from AlertBadge click
  // that happened before monitor tab was rendered).
  if (isValidSubTab(appState.preferredMonitorSubTab)) {
    activeSubTab.value = appState.preferredMonitorSubTab
    appState.preferredMonitorSubTab = null
  }
})

watch(
  () => appState.preferredMonitorSubTab,
  (newVal) => {
    if (isValidSubTab(newVal)) {
      activeSubTab.value = newVal
      appState.preferredMonitorSubTab = null
    }
  },
)

// ── Dashboard data ────────────────────────────────────────────────────────────

const {
  dashboard,
  filteredAgents,
  activeAgents,
  inactiveAgents,
  subagents,
  connectionStatus,
  costRange,
  getAgentCost,
  totalCost,
  dataAge,
  freshness,
} = useDashboard()

// ── Agent order (drag-to-reorder) ────────────────────────────────────────────

const { sortedView, seedFromAgents } = useAgentOrder()

// Seed on first agent arrival so initial server order is preserved
watch(
  () => (dashboard.value?.agents ?? []).length,
  () => {
    const allAgents = dashboard.value?.agents ?? []
    if (allAgents.length > 0) {
      seedFromAgents(allAgents)
    }
  },
  { immediate: true },
)

// Sorted active / inactive views exposed to child components
const sortedActiveAgents = computed(() => sortedView(activeAgents.value))
const sortedInactiveAgents = computed(() => sortedView(inactiveAgents.value))

// ── Search ───────────────────────────────────────────────────────────────────

const searchQuery = computed({
  get: () => appState.agentSearchQuery,
  set: (v: string) => {
    appState.agentSearchQuery = v
  },
})

// ── Empty state ───────────────────────────────────────────────────────────────

const isEmpty = computed(
  () => filteredAgents.value.length === 0,
)

// ── Navigation ────────────────────────────────────────────────────────────────

function showAgentDetail(id: string) {
  appState.currentDetailAgentId = id
  emit('agent-click', id)
}

// ── Subagents typed ──────────────────────────────────────────────────────────

const subagentsAsRecords = computed(
  () => subagents.value as unknown as Record<string, unknown>[],
)

// ── Connection badge label ────────────────────────────────────────────────────

const connectionLabel = computed(() => {
  switch (connectionStatus.value) {
    case 'connected':
      return '● 即時'
    case 'reconnecting':
      return '◐ 重連中'
    default:
      return '○ 離線'
  }
})

const connectionClass = computed(() => connectionStatus.value)

const freshnessLabel = computed(() => formatFreshnessLabel(freshness.value, dataAge.value))

// ── Compare modal ─────────────────────────────────────────────────────────────

const compareIds = ref<{ a: string; b: string } | null>(null)

const compareAgentA = computed<CompareAgentLike | null>(() => {
  if (!compareIds.value) return null
  const agent = dashboard.value?.agents.find((ag) => ag.id === compareIds.value!.a)
  return agent ? (agent as unknown as CompareAgentLike) : null
})

const compareAgentB = computed<CompareAgentLike | null>(() => {
  if (!compareIds.value) return null
  const agent = dashboard.value?.agents.find((ag) => ag.id === compareIds.value!.b)
  return agent ? (agent as unknown as CompareAgentLike) : null
})

function openCompare(idA: string, idB: string) {
  compareIds.value = { a: idA, b: idB }
}

function closeCompare() {
  compareIds.value = null
}

// ── Activity Heatmap ──────────────────────────────────────────────────────────

// The dashboard payload does not include historical per-day session counts,
// so we use the localStorage accumulator.  Each SSE message signals that the
// dashboard is live; we record one "activity tick" per successful SSE update.
//
// Guard: localStorage may not be available or functional in test environments.
function _tryGetStorage(): Storage | null {
  try {
    if (typeof localStorage !== 'undefined') {
      // Verify localStorage is actually functional before using it
      localStorage.getItem('__oc_probe__')
      return localStorage
    }
  } catch {
    // Ignore — localStorage unavailable or broken (e.g. test environment)
  }
  return null
}
const _storage = _tryGetStorage()
const _accumulator = _storage ? useActivityAccumulator(_storage) : null

// Record a tick whenever we receive a fresh SSE payload
watch(
  () => appState.latestDashboard,
  (newVal, oldVal) => {
    if (newVal && newVal !== oldVal) {
      _accumulator?.increment()
    }
  },
)

// Incremented when user resets the heatmap accumulator, forcing recomputation
const _heatmapResetKey = ref(0)

// Compute the heatmap data from localStorage
const heatmapData = computed<Map<string, number> | null>(() => {
  // Re-compute when dashboard updates so heatmap reflects the latest tick
  void appState.latestDashboard
  // Re-compute when user resets accumulator
  void _heatmapResetKey.value
  return _accumulator?.load() ?? null
})

function onHeatmapReset(): void {
  _heatmapResetKey.value++
}

/**
 * Handle click on an ActivityHeatmap cell.
 * Opens the QuickCaptureList and jumps to the selected day.
 */
function onActivitySelect(dateKey: string): void {
  useQuickCapture().openListWithJump(dateKey)
}
</script>

<template>
  <div class="monitor-tab">
    <!-- Summary cards (for agents sub-tab) -->
    <SummaryCards
      :active-tab="activeSubTab"
      :dashboard="dashboard"
      :total-cost="totalCost"
      :cost-range="costRange"
      @update:cost-range="costRange = $event as 'today' | 'week' | 'month' | 'all'"
    />

    <!-- Daily digest card with copy button -->
    <DailyDigestCard :dashboard="dashboard" />

    <!-- Sub-tab navigation -->
    <div class="sub-tabs">
      <button
        :class="['sub-tab', { active: activeSubTab === 'agents' }]"
        @click="activeSubTab = 'agents'"
      >
        Agents
        <span class="tab-badge">{{ dashboard?.agents?.length ?? 0 }}</span>
      </button>
      <button
        :class="['sub-tab', { active: activeSubTab === 'subagents' }]"
        @click="activeSubTab = 'subagents'"
      >
        Sub-Agents
        <span class="tab-badge">{{ subagents.length }}</span>
      </button>
      <button
        :class="['sub-tab', { active: activeSubTab === 'cron' }]"
        @click="activeSubTab = 'cron'"
      >
        Cron
      </button>
      <button
        :class="['sub-tab', { active: activeSubTab === 'taskhub' }]"
        @click="activeSubTab = 'taskhub'"
      >
        TaskHub
      </button>
      <button
        :class="['sub-tab', { active: activeSubTab === 'observability' }]"
        @click="activeSubTab = 'observability'"
      >
        Observability
      </button>
      <button
        :class="['sub-tab', { active: activeSubTab === 'constellation' }]"
        @click="activeSubTab = 'constellation'"
      >
        🌌 Constellation
      </button>

      <!-- Connection status indicator -->
      <span :class="['connection-status', connectionClass]" style="margin-left: auto">
        {{ connectionLabel }}
      </span>
      <span :class="['freshness-indicator', freshness]" style="margin-left: 8px; font-size: 12px">
        {{ freshnessLabel }}
      </span>
    </div>

    <!-- Agents tab -->
    <template v-if="activeSubTab === 'agents'">
      <!-- Minimap -->
      <AgentMinimap
        :agents="dashboard?.agents ?? []"
        @select="showAgentDetail"
      />

      <!-- Search input -->
      <div class="agent-search-wrap">
        <input
          v-model="searchQuery"
          class="search-input"
          type="search"
          placeholder="搜尋 Agent..."
          aria-label="搜尋 Agent"
        />
      </div>

      <!-- Focus: active agents (sorted by user-defined order) -->
      <AgentFocus
        :agents="sortedActiveAgents"
        :get-agent-cost="getAgentCost"
        @agent-click="showAgentDetail"
        @agent-chat="(id: string) => emit('agent-chat', id)"
        @agent-model-switch="(id: string, model: string) => emit('agent-model-switch', id, model)"
        @agent-compare="(idA: string, idB: string) => openCompare(idA, idB)"
      />

      <!-- Periphery: idle/dormant agents (sorted by user-defined order) -->
      <AgentPeriphery
        :agents="sortedInactiveAgents"
        :get-agent-cost="getAgentCost"
        @agent-click="showAgentDetail"
      />

      <!-- Activity Heatmap -->
      <div class="heatmap-row">
        <ActivityHeatmap :data="heatmapData" @reset="onHeatmapReset" @select="onActivitySelect" />
      </div>

      <!-- Empty state -->
      <EmptyState
        v-if="isEmpty"
        variant="agents"
        :title="searchQuery ? '找不到符合的 Agent' : '沒有 Agent'"
        :description="searchQuery ? '請嘗試其他關鍵字' : '目前沒有已註冊的 Agent'"
      />
    </template>

    <!-- Sub-Agents tab -->
    <template v-else-if="activeSubTab === 'subagents'">
      <SubAgentGrid :subagents="subagentsAsRecords" />
    </template>

    <!-- Cron tab -->
    <template v-else-if="activeSubTab === 'cron'">
      <CronTab />
    </template>

    <!-- TaskHub tab -->
    <template v-else-if="activeSubTab === 'taskhub'">
      <TaskHubTab />
    </template>

    <!-- Observability tab -->
    <template v-else-if="activeSubTab === 'observability'">
      <ObservabilityTab />
    </template>

    <!-- Constellation tab -->
    <template v-else-if="activeSubTab === 'constellation'">
      <AgentConstellation
        :agents="dashboard?.agents ?? []"
        :subagents="subagentsAsRecords as unknown as { ownerAgent?: string; subagentId?: string; label?: string; status?: string; tokens?: number }[]"
        @drill-down="onConstellationDrillDown"
      />
    </template>

    <!-- Compare Modal -->
    <AgentCompareModal
      v-if="compareIds && compareAgentA && compareAgentB"
      :agentA="compareAgentA"
      :agentB="compareAgentB"
      @close="closeCompare"
    />
  </div>
</template>

<style scoped>
.heatmap-row {
  padding: 12px 0 4px;
}
</style>
