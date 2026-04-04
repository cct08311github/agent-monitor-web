<script setup lang="ts">
import type { Agent } from '@/types/api'
import { getStatusInfo } from '@/utils/format'

defineProps<{
  agents: Agent[]
}>()

const emit = defineEmits<{
  (e: 'select', id: string): void
}>()
</script>

<template>
  <div class="agent-minimap">
    <div
      v-for="agent in agents"
      :key="agent.id"
      :class="['minimap-dot', getStatusInfo(agent.status).class]"
      :title="agent.id + ' — ' + getStatusInfo(agent.status).text"
      role="button"
      :aria-label="agent.id"
      tabindex="0"
      @click="emit('select', agent.id)"
      @keydown.enter="emit('select', agent.id)"
    ></div>
  </div>
</template>
