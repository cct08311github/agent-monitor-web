<script setup lang="ts">
import SubAgentCard from '@/components/SubAgentCard.vue'
import EmptyState from '@/components/EmptyState.vue'

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
    <EmptyState
      v-else
      variant="agents"
      title="沒有 Sub-Agents"
      description="尚無子 Agent 運行中"
    />
  </div>
</template>
