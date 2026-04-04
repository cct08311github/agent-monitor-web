<script setup lang="ts">
import SubAgentCard from '@/components/SubAgentCard.vue'

defineProps<{
  subagents: Record<string, unknown>[]
}>()
</script>

<template>
  <div class="agent-grid subagent-grid">
    <template v-if="subagents.length > 0">
      <SubAgentCard
        v-for="(sub, idx) in subagents.slice(0, 40)"
        :key="String(sub['subagentId'] ?? idx)"
        :subagent="sub"
      />
    </template>
    <div v-else style="color: var(--text-muted); padding: 20px; text-align: center">
      沒有 Sub-Agents
    </div>
  </div>
</template>
