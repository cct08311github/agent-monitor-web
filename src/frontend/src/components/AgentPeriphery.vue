<script setup lang="ts">
import { ref } from 'vue'
import type { Agent } from '@/types/api'
import { formatTokens, formatTWD, getStatusInfo } from '@/utils/format'
import { appState } from '@/stores/appState'
import { useAgentAliases } from '@/composables/useAgentAliases'
import { useAgentOrder } from '@/composables/useAgentOrder'

defineProps<{
  agents: Agent[]
  getAgentCost: (a: Agent) => number
}>()

const emit = defineEmits<{
  (e: 'agent-click', id: string): void
}>()

const { displayName } = useAgentAliases()
const { handleDrop } = useAgentOrder()

const draggingId = ref<string | null>(null)
const dropTargetId = ref<string | null>(null)

function onDragStart(event: DragEvent, agentId: string) {
  draggingId.value = agentId
  if (event.dataTransfer) {
    event.dataTransfer.setData('text/plain', agentId)
    event.dataTransfer.effectAllowed = 'move'
  }
}

function onDragOver(event: DragEvent, agentId: string) {
  event.preventDefault()
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move'
  }
  dropTargetId.value = agentId
}

function onDragLeave(agentId: string) {
  if (dropTargetId.value === agentId) {
    dropTargetId.value = null
  }
}

function onDrop(event: DragEvent, agentId: string) {
  event.preventDefault()
  const dragId = event.dataTransfer?.getData('text/plain') ?? draggingId.value
  if (dragId) {
    handleDrop(dragId, agentId)
  }
  draggingId.value = null
  dropTargetId.value = null
}

function onDragEnd() {
  draggingId.value = null
  dropTargetId.value = null
}

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
        :class="{
          'is-dragging': draggingId === agent.id,
          'is-drop-target': dropTargetId === agent.id && draggingId !== agent.id,
        }"
        role="button"
        :aria-label="agent.id"
        :aria-grabbed="draggingId === agent.id ? 'true' : 'false'"
        tabindex="0"
        draggable="true"
        @click="emit('agent-click', agent.id)"
        @keydown.enter="emit('agent-click', agent.id)"
        @dragstart="onDragStart($event, agent.id)"
        @dragover="onDragOver($event, agent.id)"
        @dragleave="onDragLeave(agent.id)"
        @drop="onDrop($event, agent.id)"
        @dragend="onDragEnd"
      >
        <span :class="['periphery-dot', getStatusInfo(agent.status).class]"></span>
        <span class="periphery-name" :title="agent.id">{{ displayName(agent.id) }}</span>
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

<style scoped>
.periphery-row:not(.periphery-thead) {
  cursor: grab;
  transition: opacity 0.15s, outline 0.1s;
  outline: 2px solid transparent;
  outline-offset: -2px;
  border-radius: 4px;
}

.periphery-row:not(.periphery-thead):active {
  cursor: grabbing;
}

.periphery-row.is-dragging {
  opacity: 0.4;
  cursor: grabbing;
}

.periphery-row.is-drop-target {
  outline-color: var(--accent, #3b82f6);
  background-color: var(--accent-bg, rgba(59, 130, 246, 0.06));
}
</style>
