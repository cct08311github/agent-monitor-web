<script setup lang="ts">
import { ref } from 'vue'
import type { Agent } from '@/types/api'
import AgentCard from '@/components/AgentCard.vue'
import { useAgentOrder } from '@/composables/useAgentOrder'

defineProps<{
  agents: Agent[]
  getAgentCost: (a: Agent) => number
}>()

const emit = defineEmits<{
  (e: 'agent-click', id: string): void
  (e: 'agent-chat', id: string): void
  (e: 'agent-model-switch', id: string, currentModel: string): void
  (e: 'agent-compare', idA: string, idB: string): void
}>()

const { handleDrop } = useAgentOrder()

// Track which tile is being dragged and which is the current drop target
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
</script>

<template>
  <div class="agent-focus">
    <template v-if="agents.length > 0">
      <div class="focus-label">執行中 ({{ agents.length }})</div>
      <div class="focus-grid">
        <div
          v-for="agent in agents"
          :key="agent.id"
          class="focus-card-wrapper"
          :class="{
            'is-dragging': draggingId === agent.id,
            'is-drop-target': dropTargetId === agent.id && draggingId !== agent.id,
          }"
          draggable="true"
          :aria-grabbed="draggingId === agent.id ? 'true' : 'false'"
          @dragstart="onDragStart($event, agent.id)"
          @dragover="onDragOver($event, agent.id)"
          @dragleave="onDragLeave(agent.id)"
          @drop="onDrop($event, agent.id)"
          @dragend="onDragEnd"
        >
          <AgentCard
            :agent="agent"
            :cost="getAgentCost(agent)"
            class="focus-card"
            @click="emit('agent-click', $event)"
            @chat="emit('agent-chat', $event)"
            @model-switch="(id, model) => emit('agent-model-switch', id, model)"
            @compare="(idA, idB) => emit('agent-compare', idA, idB)"
          />
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.focus-card-wrapper {
  cursor: grab;
  transition: opacity 0.15s, outline 0.1s;
  border-radius: 8px;
  outline: 2px solid transparent;
  outline-offset: 2px;
}

.focus-card-wrapper:active {
  cursor: grabbing;
}

.focus-card-wrapper.is-dragging {
  opacity: 0.45;
  cursor: grabbing;
}

.focus-card-wrapper.is-drop-target {
  outline-color: var(--accent, #3b82f6);
  background-color: var(--accent-bg, rgba(59, 130, 246, 0.06));
}
</style>
