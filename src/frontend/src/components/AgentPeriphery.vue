<script setup lang="ts">
import type { Agent } from '@/types/api'
import { formatTokens, formatTWD, getStatusInfo } from '@/utils/format'
import { appState } from '@/stores/appState'

defineProps<{
  agents: Agent[]
  getAgentCost: (a: Agent) => number
}>()

const emit = defineEmits<{
  (e: 'agent-click', id: string): void
}>()

function getTokens(a: Agent): number {
  const ext = a as unknown as Record<string, unknown>
  const tokens = ext['tokens'] as Record<string, unknown> | undefined
  return Number(tokens?.['total'] ?? a.tokenUsage ?? 0)
}

function getLastActivity(a: Agent): string {
  const ext = a as unknown as Record<string, unknown>
  return String(ext['lastActivity'] ?? '—')
}
</script>

<template>
  <div class="agent-periphery">
    <details v-if="agents.length > 0" class="periphery-details" open>
      <summary class="periphery-header">閒置 ({{ agents.length }})</summary>

      <!-- Table header -->
      <div class="periphery-row periphery-thead">
        <span class="periphery-dot-col"></span>
        <span class="periphery-name">AGENT</span>
        <span class="periphery-model">MODEL</span>
        <span class="periphery-activity">ACTIVITY</span>
        <span class="periphery-cost">COST</span>
        <span class="periphery-tokens">TOKENS</span>
      </div>

      <!-- Data rows -->
      <div
        v-for="agent in agents"
        :key="agent.id"
        class="periphery-row"
        role="button"
        :aria-label="agent.id"
        tabindex="0"
        @click="emit('agent-click', agent.id)"
        @keydown.enter="emit('agent-click', agent.id)"
      >
        <span :class="['periphery-dot', getStatusInfo(agent.status).class]"></span>
        <span class="periphery-name">{{ agent.id }}</span>
        <span class="periphery-model">
          {{ (agent.model ?? '').split('/').pop() || 'N/A' }}
        </span>
        <span class="periphery-activity">{{ getLastActivity(agent) }}</span>
        <span class="periphery-cost">
          {{ formatTWD(getAgentCost(agent), appState.currentExchangeRate) }}
        </span>
        <span class="periphery-tokens">{{ formatTokens(getTokens(agent)) }}</span>
      </div>
    </details>
  </div>
</template>
