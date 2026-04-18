<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import type { Agent } from '@/types/api'
import { formatTokens, formatTWD, getAgentEmoji, getStatusInfo } from '@/utils/format'
import { appState } from '@/stores/appState'
import { createFocusTrap } from '@/lib/focusTrap'

const props = defineProps<{
  agent: Agent
  cost: number
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'detail'): void
}>()

const popoverRef = ref<HTMLDivElement | null>(null)
const trap = createFocusTrap()

function getTokens(a: Agent): number {
  const ext = a as unknown as Record<string, unknown>
  const tokens = ext['tokens'] as Record<string, unknown> | undefined
  return Number(tokens?.['total'] ?? a.tokenUsage ?? 0)
}

function getLastActivity(a: Agent): string {
  const ext = a as unknown as Record<string, unknown>
  return String(ext['lastActivity'] ?? '-')
}

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

function handleOutsideClick(event: MouseEvent): void {
  if (popoverRef.value && !popoverRef.value.contains(event.target as Node)) {
    emit('close')
  }
}

function handleDetail(): void {
  emit('detail')
  emit('close')
}

// Guard against setTimeout callback firing after unmount (listener leak)
let mounted = false

onMounted(() => {
  mounted = true
  if (popoverRef.value) {
    trap.activate(popoverRef.value, () => emit('close'))
  }
  // Attach outside-click on next tick to avoid catching the triggering right-click
  setTimeout(() => {
    if (mounted) document.addEventListener('click', handleOutsideClick)
  }, 0)
})

onBeforeUnmount(() => {
  mounted = false
  trap.deactivate()
  document.removeEventListener('click', handleOutsideClick)
})
</script>

<template>
  <div
    ref="popoverRef"
    class="agent-quick-diagnose"
    role="dialog"
    :aria-label="'Quick diagnose: ' + agent.id"
  >
    <div class="aqd-header">
      <div class="aqd-title">
        <span class="aqd-emoji">{{ getAgentEmoji(agent.id) }}</span>
        <strong>{{ agent.id }}</strong>
      </div>
      <button type="button" class="aqd-close" aria-label="關閉" @click="emit('close')">✕</button>
    </div>

    <div :class="['aqd-status', getStatusInfo(agent.status).dotClass]">
      <span class="status-icon" aria-hidden="true">{{ getStatusInfo(agent.status).icon }}</span>
      <span>{{ getStatusInfo(agent.status).text }}</span>
    </div>

    <dl class="aqd-rows">
      <dt>Model</dt>
      <dd>{{ agent.model || '—' }}</dd>
      <dt>活動</dt>
      <dd>{{ getLastActivity(agent) }}</dd>
      <dt>費用</dt>
      <dd>{{ formatTWD(cost, appState.currentExchangeRate) }}</dd>
      <dt>Tokens</dt>
      <dd>{{ formatTokens(getTokens(agent)) }}</dd>
    </dl>

    <div v-if="getTaskText(agent)" class="aqd-task">
      <div class="aqd-task-label">
        {{ getTaskLabel(agent) === 'EXECUTING' ? '執行中' : '💤 閒置' }}
      </div>
      <div class="aqd-task-text" :title="getTaskText(agent)">
        {{ getTaskText(agent) }}
      </div>
    </div>

    <button type="button" class="aqd-detail-btn" @click="handleDetail">
      🔍 完整檢查
    </button>
  </div>
</template>
