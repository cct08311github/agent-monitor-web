<script setup lang="ts">
import { ref, computed } from 'vue'
import type { Agent } from '@/types/api'
import { formatTokens, formatTWD, getAgentEmoji, getStatusInfo } from '@/utils/format'
import { computeAgentMood } from '@/utils/agentMood'
import { appState } from '@/stores/appState'
import { showToast } from '@/composables/useToast'
import AgentQuickDiagnose from '@/components/AgentQuickDiagnose.vue'
import { useAgentAliases } from '@/composables/useAgentAliases'
import { hasAgentNotes, agentNotesLength } from '@/utils/agentNotesIndicator'

const { displayName } = useAgentAliases()

const props = defineProps<{
  agent: Agent
  cost: number
}>()

const emit = defineEmits<{
  (e: 'click', id: string): void
  (e: 'chat', id: string): void
  (e: 'model-switch', id: string, currentModel: string): void
  (e: 'compare', idA: string, idB: string): void
}>()

const showQuickDiagnose = ref(false)

const mood = computed(() => {
  const ext = props.agent as unknown as Record<string, unknown>
  return computeAgentMood({
    status: props.agent.status,
    lastActivity: String(ext['lastActivity'] ?? ''),
    currentTask: ext['currentTask'] as { task?: string } | undefined,
  })
})

const notesIndicator = computed(() => ({
  has: hasAgentNotes(props.agent.id),
  len: agentNotesLength(props.agent.id),
}))

function handleCardClick() {
  emit('click', props.agent.id)
}

function handleContextMenu(event: MouseEvent) {
  event.preventDefault()
  showQuickDiagnose.value = true
}

function handleQuickDetail() {
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

// ---------------------------------------------------------------------------
// Compare button logic
// ---------------------------------------------------------------------------

const isFirstSelected = computed(
  () => appState.compareSelection?.firstAgentId === props.agent.id,
)

const compareButtonTitle = computed(() => {
  if (isFirstSelected.value) return '取消選擇（點擊以取消）'
  if (appState.compareSelection?.firstAgentId) return `與 ${appState.compareSelection.firstAgentId} 比較`
  return '選擇此 agent 作為比較對象'
})

function onCompareClick(event: MouseEvent) {
  event.stopPropagation()

  const sel = appState.compareSelection

  if (!sel || sel.firstAgentId === null) {
    // First selection
    appState.compareSelection = { firstAgentId: props.agent.id }
    showToast(`已選擇 ${props.agent.id}，再點一個 agent 進行比較`, 'info')
    return
  }

  if (sel.firstAgentId === props.agent.id) {
    // Cancel own selection
    appState.compareSelection = null
    showToast('已取消', 'info')
    return
  }

  // Second selection — emit compare event, then clear state
  const firstId = sel.firstAgentId
  appState.compareSelection = null
  emit('compare', firstId, props.agent.id)
}
</script>

<template>
  <div
    :class="['agent-card', getStatusInfo(agent.status).class]"
    role="article"
    :aria-label="agent.id"
    @click="handleCardClick"
    @contextmenu="handleContextMenu"
  >
    <!-- Header -->
    <div class="agent-card-header">
      <div class="agent-card-name">
        <div class="agent-avatar">{{ getAgentEmoji(agent.id) }}</div>
        <div>
          <div class="agent-name" :title="agent.id">{{ displayName(agent.id) }}</div>
          <div class="agent-hostname">{{ agent.model || 'N/A' }}</div>
        </div>
      </div>

      <div class="agent-card-header-right">
        <div class="agent-header-top-row">
          <div
            class="agent-mood"
            :title="mood.label + ' · ' + mood.reason"
            :aria-label="`心情: ${mood.label} (${mood.reason})`"
          >
            {{ mood.emoji }}
          </div>
          <span
            v-if="notesIndicator.has"
            class="agent-notes-icon"
            :title="`有筆記 (${notesIndicator.len} 字)`"
            :aria-label="`有筆記 (${notesIndicator.len} 字)`"
            aria-hidden="false"
          >📝</span>
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
        <!-- Compare button — visible on hover or when selected -->
        <button
          :class="['agent-compare-btn', { 'is-selected': isFirstSelected }]"
          :title="compareButtonTitle"
          :aria-label="compareButtonTitle"
          :aria-pressed="isFirstSelected"
          @click.stop="onCompareClick"
        >⚖️</button>
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

    <!-- Quick diagnose popover (right-click / context menu) -->
    <AgentQuickDiagnose
      v-if="showQuickDiagnose"
      :agent="agent"
      :cost="cost"
      @close="showQuickDiagnose = false"
      @detail="handleQuickDetail"
    />
  </div>
</template>

<style scoped>
.agent-card-header-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

/* Row that groups mood emoji + notes icon side by side */
.agent-header-top-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.agent-mood {
  font-size: 1.25rem;
  line-height: 1;
  cursor: default;
  user-select: none;
  /* keep emoji crisp without layout shift */
  width: 1.5rem;
  text-align: center;
}

/* Notes indicator icon */
.agent-notes-icon {
  font-size: 0.75rem;
  line-height: 1;
  cursor: default;
  user-select: none;
  opacity: 0.8;
  color: var(--accent, #3b82f6);
}

/* Compare button — hidden by default, shown on card hover or when selected */
.agent-compare-btn {
  font-size: 0.85rem;
  line-height: 1;
  background: none;
  border: 1px solid transparent;
  border-radius: 4px;
  cursor: pointer;
  padding: 2px 4px;
  opacity: 0;
  transition: opacity 0.15s, border-color 0.15s;
  user-select: none;
}

.agent-compare-btn.is-selected {
  opacity: 1;
  border-color: var(--accent, #3b82f6);
  background-color: var(--accent-bg, rgba(59, 130, 246, 0.1));
}

.agent-card:hover .agent-compare-btn {
  opacity: 0.7;
}

.agent-card:hover .agent-compare-btn:hover {
  opacity: 1;
  border-color: var(--border, #e0e0e0);
}
</style>
