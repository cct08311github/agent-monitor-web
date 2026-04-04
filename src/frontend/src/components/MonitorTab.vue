<script setup lang="ts">
import { ref, computed } from 'vue'
import { appState } from '@/stores/appState'
import { useDashboard } from '@/composables/useDashboard'
import AgentMinimap from '@/components/AgentMinimap.vue'
import AgentFocus from '@/components/AgentFocus.vue'
import AgentPeriphery from '@/components/AgentPeriphery.vue'
import SubAgentGrid from '@/components/SubAgentGrid.vue'
import SummaryCards from '@/components/SummaryCards.vue'
import CronTab from '@/components/CronTab.vue'
import TaskHubTab from '@/components/TaskHubTab.vue'

const emit = defineEmits<{
  (e: 'agent-click', agentId: string): void
  (e: 'agent-chat', agentId: string): void
  (e: 'agent-model-switch', agentId: string, model: string): void
}>()

// ── Sub-tab state ────────────────────────────────────────────────────────────

type SubTab = 'agents' | 'subagents' | 'cron' | 'taskhub'

const activeSubTab = ref<SubTab>('agents')

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
} = useDashboard()

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

      <!-- Connection status indicator -->
      <span :class="['connection-status', connectionClass]" style="margin-left: auto">
        {{ connectionLabel }}
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

      <!-- Focus: active agents -->
      <AgentFocus
        :agents="activeAgents"
        :get-agent-cost="getAgentCost"
        @agent-click="showAgentDetail"
        @agent-chat="showAgentDetail"
        @agent-model-switch="(id) => showAgentDetail(id)"
      />

      <!-- Periphery: idle/dormant agents -->
      <AgentPeriphery
        :agents="inactiveAgents"
        :get-agent-cost="getAgentCost"
        @agent-click="showAgentDetail"
      />

      <!-- Empty state -->
      <div v-if="isEmpty" class="empty-state">
        <div class="empty-state-icon">🔍</div>
        <div class="empty-state-title">
          {{ searchQuery ? '找不到符合的 Agent' : '沒有 Agent' }}
        </div>
        <div class="empty-state-desc">
          {{ searchQuery ? '請嘗試其他關鍵字' : '目前沒有已註冊的 Agent' }}
        </div>
      </div>
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
  </div>
</template>
