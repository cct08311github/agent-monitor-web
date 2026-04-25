<script setup lang="ts">
import EmptyAgents from '@/components/illustrations/EmptyAgents.vue'
import EmptyLogs from '@/components/illustrations/EmptyLogs.vue'
import EmptyAlerts from '@/components/illustrations/EmptyAlerts.vue'
import EmptyCron from '@/components/illustrations/EmptyCron.vue'
import EmptyTasks from '@/components/illustrations/EmptyTasks.vue'
import EmptyGeneric from '@/components/illustrations/EmptyGeneric.vue'

const props = withDefaults(
  defineProps<{
    title: string
    description?: string
    actionLabel?: string
    onAction?: () => void
    variant?: 'agents' | 'logs' | 'alerts' | 'cron' | 'tasks' | 'generic'
  }>(),
  {
    variant: 'generic',
  },
)

const illustrationMap = {
  agents: EmptyAgents,
  logs: EmptyLogs,
  alerts: EmptyAlerts,
  cron: EmptyCron,
  tasks: EmptyTasks,
  generic: EmptyGeneric,
} as const

const showAction = (): boolean =>
  Boolean(props.actionLabel && props.onAction)
</script>

<template>
  <div
    class="empty-state-root"
    role="status"
    aria-live="polite"
    :data-variant="variant"
  >
    <div class="empty-state-illustration">
      <component :is="illustrationMap[variant ?? 'generic']" />
    </div>
    <h3 class="empty-state-title">{{ title }}</h3>
    <p v-if="description" class="empty-state-desc">{{ description }}</p>
    <button
      v-if="showAction()"
      class="empty-state-action"
      type="button"
      @click="onAction!()"
    >
      {{ actionLabel }}
    </button>
  </div>
</template>

<style scoped>
.empty-state-root {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  text-align: center;
  gap: 12px;
  color: var(--text-muted);
}

.empty-state-illustration {
  width: 120px;
  height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 8px;
  color: var(--text-muted);
}

@media (prefers-reduced-motion: no-preference) {
  .empty-state-illustration {
    animation: empty-float 3s ease-in-out infinite;
  }
}

@keyframes empty-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}

.empty-state-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-secondary);
  margin: 0;
}

.empty-state-desc {
  font-size: 0.875rem;
  color: var(--text-muted);
  margin: 0;
  max-width: 280px;
  line-height: 1.5;
}

.empty-state-action {
  margin-top: 8px;
  padding: 8px 18px;
  border-radius: 6px;
  border: 1px solid var(--accent);
  background: var(--accent-light);
  color: var(--accent);
  font-size: 0.875rem;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.empty-state-action:hover {
  background: var(--accent);
  color: var(--bg-card, #1e1e24);
}
</style>
