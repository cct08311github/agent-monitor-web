<script setup lang="ts">
import type { Agent } from '@/types/api'
import AgentCard from '@/components/AgentCard.vue'

defineProps<{
  agents: Agent[]
  getAgentCost: (a: Agent) => number
}>()

const emit = defineEmits<{
  (e: 'agent-click', id: string): void
  (e: 'agent-chat', id: string): void
  (e: 'agent-model-switch', id: string, currentModel: string): void
}>()
</script>

<template>
  <div class="agent-focus">
    <template v-if="agents.length > 0">
      <div class="focus-label">執行中 ({{ agents.length }})</div>
      <div class="focus-grid">
        <AgentCard
          v-for="agent in agents"
          :key="agent.id"
          :agent="agent"
          :cost="getAgentCost(agent)"
          class="focus-card"
          @click="emit('agent-click', $event)"
          @chat="emit('agent-chat', $event)"
          @model-switch="(id, model) => emit('agent-model-switch', id, model)"
        />
      </div>
    </template>
  </div>
</template>
