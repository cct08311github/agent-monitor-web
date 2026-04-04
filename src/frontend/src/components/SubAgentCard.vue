<script setup lang="ts">
// SubAgentCard — compact card for sub-agents
// Props use `any` because the backend SubAgent type is minimal;
// the actual payload contains additional fields (subagentId, ownerAgent, etc.)

defineProps<{
  subagent: Record<string, unknown>
}>()
</script>

<template>
  <div
    :class="[
      'agent-card',
      subagent['status'] === 'running'
        ? 'running'
        : subagent['status'] === 'recent'
          ? 'active'
          : '',
    ]"
    style="padding: 12px"
  >
    <!-- Header -->
    <div class="agent-card-header" style="margin-bottom: 8px">
      <div class="agent-card-name">
        <div class="agent-avatar" style="width: 28px; height: 28px; font-size: 12px">🔗</div>
        <div>
          <div class="agent-name" style="font-size: 12px">
            {{ String(subagent['subagentId'] ?? '').slice(0, 8) }}
            <span
              v-if="subagent['abortedLastRun']"
              style="color: var(--red); font-weight: 600; font-size: 10px"
            >
              ⚠️ ABORTED
            </span>
          </div>
          <div class="agent-hostname">by {{ subagent['ownerAgent'] }}</div>
        </div>
      </div>

      <div
        :class="[
          'agent-status',
          subagent['status'] === 'running'
            ? 'online'
            : subagent['status'] === 'recent'
              ? 'running'
              : 'idle',
        ]"
        style="font-size: 10px; padding: 2px 8px"
      >
        <span class="agent-status-dot"></span>
        {{ String(subagent['status'] ?? '').toUpperCase() }}
      </div>
    </div>

    <!-- Task preview -->
    <div
      class="agent-task-preview"
      style="margin: 4px 0 8px 0; background: rgba(0,0,0,0.03); border-radius: 4px; padding: 6px"
    >
      <div
        class="agent-task-content"
        style="font-size: 11px; color: var(--text); white-space: pre-wrap; word-break: break-word; max-height: 40px; overflow-y: auto"
      >
        {{ subagent['label'] }}
      </div>
    </div>

    <!-- Info rows -->
    <div class="agent-info-row" style="font-size: 11px; margin-bottom: 2px">
      <span class="agent-info-label">最後活動</span>
      <span class="agent-info-value">{{ subagent['lastActivity'] }}</span>
    </div>

    <div class="agent-info-row" style="font-size: 11px">
      <span class="agent-info-label">模型 / 耗時</span>
      <div style="display: flex; gap: 4px; align-items: center">
        <span class="agent-info-value" style="font-size: 10px; opacity: 0.8">
          {{
            subagent['model']
              ? String(subagent['model']).split('/').pop()
              : 'unknown'
          }}
        </span>
        <span
          v-if="subagent['duration']"
          class="agent-info-value"
          style="background: var(--bg-muted); padding: 1px 4px; border-radius: 4px"
        >
          {{ subagent['duration'] }}
        </span>
      </div>
    </div>
  </div>
</template>
