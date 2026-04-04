<script setup lang="ts">
import type { Agent } from '@/types/api'
import { formatTokens, formatTWD, getAgentEmoji, getStatusInfo } from '@/utils/format'
import { appState } from '@/stores/appState'

const props = defineProps<{
  agent: Agent
  cost: number
}>()

const emit = defineEmits<{
  (e: 'click', id: string): void
  (e: 'chat', id: string): void
  (e: 'model-switch', id: string, currentModel: string): void
}>()

function handleCardClick() {
  emit('click', props.agent.id)
}

function handleChat(event: MouseEvent) {
  event.stopPropagation()
  emit('chat', props.agent.id)
}

function handleModelSwitch(event: MouseEvent) {
  event.stopPropagation()
  emit('model-switch', props.agent.id, props.agent.model ?? '')
}

// Derive task info from the agent object (backend may send extended fields)
function getTaskText(a: Agent): string {
  const ext = a as unknown as Record<string, unknown>
  const ct = ext['currentTask'] as Record<string, unknown> | undefined
  return String(ct?.['task'] ?? '')
}

function getTaskLabel(a: Agent): string {
  const ext = a as unknown as Record<string, unknown>
  const ct = ext['currentTask'] as Record<string, unknown> | undefined
  return String(ct?.['label'] ?? '')
}

function getLastActivity(a: Agent): string {
  const ext = a as unknown as Record<string, unknown>
  return String(ext['lastActivity'] ?? '-')
}

function getTokens(a: Agent): number {
  const ext = a as unknown as Record<string, unknown>
  const tokens = ext['tokens'] as Record<string, unknown> | undefined
  return Number(tokens?.['total'] ?? a.tokenUsage ?? 0)
}
</script>

<template>
  <div
    :class="['agent-card', getStatusInfo(agent.status).class]"
    role="article"
    :aria-label="agent.id"
    @click="handleCardClick"
  >
    <!-- Header -->
    <div class="agent-card-header">
      <div class="agent-card-name">
        <div class="agent-avatar">{{ getAgentEmoji(agent.id) }}</div>
        <div>
          <div class="agent-name">{{ agent.id }}</div>
          <div class="agent-hostname">{{ agent.model || 'N/A' }}</div>
        </div>
      </div>

      <div
        :class="['agent-status', getStatusInfo(agent.status).dotClass]"
        role="status"
        :aria-label="'狀態: ' + getStatusInfo(agent.status).text"
      >
        <span class="status-icon" aria-hidden="true">{{ getStatusInfo(agent.status).icon }}</span>
        <span class="agent-status-dot" aria-hidden="true"></span>
        {{ ' ' + getStatusInfo(agent.status).text }}
      </div>
    </div>

    <!-- Body -->
    <div class="agent-card-body">
      <div class="agent-info-row">
        <span class="agent-info-label">費用</span>
        <span class="agent-info-value">{{ formatTWD(cost, appState.currentExchangeRate) }}</span>
      </div>
      <div class="agent-info-row">
        <span class="agent-info-label">Tokens</span>
        <span class="agent-info-value">{{ formatTokens(getTokens(agent)) }}</span>
      </div>
      <div class="agent-info-row">
        <span class="agent-info-label">活動</span>
        <span class="agent-info-value">{{ getLastActivity(agent) }}</span>
      </div>

      <!-- Task preview -->
      <div v-if="getTaskText(agent)" class="agent-task-preview">
        <div class="agent-task-header">
          <span
            :class="['agent-task-label', getTaskLabel(agent) === 'EXECUTING' ? 'executing' : 'idle']"
          >
            <span v-if="getTaskLabel(agent) === 'EXECUTING'" class="task-pulse"></span>
            {{ getTaskLabel(agent) === 'EXECUTING' ? '執行中' : '💤 閒置' }}
          </span>
        </div>
        <div class="agent-task-content" :title="getTaskText(agent)">
          {{ getTaskText(agent) }}
        </div>
      </div>
    </div>

    <!-- Actions -->
    <div class="agent-card-actions" @click.stop>
      <button class="agent-action-btn" @click="handleChat">💬 對話</button>
      <button class="agent-action-btn" @click="handleModelSwitch">🔄 模型</button>
    </div>
  </div>
</template>
