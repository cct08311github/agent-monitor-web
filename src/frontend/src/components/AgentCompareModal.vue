<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { buildComparison } from '@/utils/agentCompare'
import type { CompareAgentLike, ComparisonRow } from '@/utils/agentCompare'
import { computeAgentMood } from '@/utils/agentMood'
import { createFocusTrap } from '@/lib/focusTrap'
import { formatTWD, formatTokens } from '@/utils/format'
import { appState } from '@/stores/appState'

// ---------------------------------------------------------------------------
// Props & emits
// ---------------------------------------------------------------------------

const props = defineProps<{
  agentA: CompareAgentLike
  agentB: CompareAgentLike
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

// ---------------------------------------------------------------------------
// Derived comparison data
// ---------------------------------------------------------------------------

const rows = computed<ComparisonRow[]>(() => buildComparison(props.agentA, props.agentB))

const moodA = computed(() =>
  computeAgentMood({
    status: props.agentA.status,
    lastActivity: props.agentA.lastActivity,
    currentTask: props.agentA.currentTask,
  }),
)

const moodB = computed(() =>
  computeAgentMood({
    status: props.agentB.status,
    lastActivity: props.agentB.lastActivity,
    currentTask: props.agentB.currentTask,
  }),
)

// ---------------------------------------------------------------------------
// Row value formatting
// ---------------------------------------------------------------------------

function formatRowValue(row: ComparisonRow, side: 'A' | 'B'): string {
  const raw = side === 'A' ? row.valueA : row.valueB
  if (raw === null || raw === undefined) return '—'
  if (typeof raw === 'string') return raw

  // Numeric — infer formatting from label
  const n = raw as number
  if (row.label.startsWith('Cost')) {
    return formatTWD(n, appState.currentExchangeRate)
  }
  if (row.label.startsWith('Token')) {
    return formatTokens(n)
  }
  return String(n)
}

// ---------------------------------------------------------------------------
// Focus trap — WCAG 2.4.3
// ---------------------------------------------------------------------------

const dialogRef = ref<HTMLDivElement | null>(null)
const trap = createFocusTrap()

onMounted(() => {
  if (dialogRef.value) trap.activate(dialogRef.value, () => emit('close'))
})

onBeforeUnmount(() => {
  trap.deactivate()
})
</script>

<template>
  <div class="modal-overlay agent-compare-overlay" @click.self="$emit('close')">
    <div
      ref="dialogRef"
      class="modal-content agent-compare-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Agent 比較"
    >
      <!-- Header -->
      <div class="modal-header agent-compare-header">
        <div class="compare-title">⚖️ Agent 比較</div>
        <button class="modal-close" aria-label="關閉比較" @click="$emit('close')">✕</button>
      </div>

      <!-- Agent name row -->
      <div class="compare-agent-names">
        <div class="compare-agent-name-cell compare-agent-a">
          <span class="compare-mood-emoji">{{ moodA.emoji }}</span>
          <span class="compare-agent-id">{{ agentA.id }}</span>
        </div>
        <div class="compare-agent-name-cell compare-agent-b">
          <span class="compare-mood-emoji">{{ moodB.emoji }}</span>
          <span class="compare-agent-id">{{ agentB.id }}</span>
        </div>
      </div>

      <!-- Comparison rows -->
      <div class="compare-rows">
        <div
          v-for="row in rows"
          :key="row.label"
          :class="[
            'compare-row',
            { 'winner-a': row.winner === 'A' },
            { 'winner-b': row.winner === 'B' },
            { 'is-tie': row.winner === 'tie' },
          ]"
        >
          <span class="compare-row-label">{{ row.label }}</span>
          <span class="compare-row-value compare-col-a">
            {{ formatRowValue(row, 'A') }}
            <span v-if="row.winner === 'A'" class="compare-trophy" aria-label="勝出">🏆</span>
          </span>
          <span class="compare-row-value compare-col-b">
            {{ formatRowValue(row, 'B') }}
            <span v-if="row.winner === 'B'" class="compare-trophy" aria-label="勝出">🏆</span>
          </span>
        </div>
      </div>

      <!-- Footer -->
      <div class="compare-footer">
        <button class="ctrl-btn" @click="$emit('close')">關閉</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.agent-compare-overlay {
  z-index: 1100;
}

.agent-compare-modal {
  max-width: 560px;
  width: 95vw;
}

.agent-compare-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.compare-title {
  font-weight: 600;
  font-size: 1rem;
}

/* Agent name row */
.compare-agent-names {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border, #e0e0e0);
}

.compare-agent-name-cell {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  font-size: 0.95rem;
}

.compare-agent-a {
  color: var(--accent, #3b82f6);
}

.compare-agent-b {
  color: var(--accent-alt, #8b5cf6);
}

.compare-mood-emoji {
  font-size: 1.2rem;
  line-height: 1;
}

.compare-agent-id {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Comparison rows */
.compare-rows {
  padding: 8px 0;
}

.compare-row {
  display: grid;
  grid-template-columns: minmax(110px, 1.5fr) 1fr 1fr;
  gap: 4px 8px;
  padding: 6px 16px;
  font-size: 0.875rem;
  transition: background-color 0.15s;
  border-radius: 4px;
  margin: 2px 8px;
}

.compare-row:hover {
  background-color: var(--surface-hover, rgba(0, 0, 0, 0.04));
}

.compare-row-label {
  color: var(--text-muted, #6b7280);
  font-size: 0.8rem;
  display: flex;
  align-items: center;
}

.compare-row-value {
  display: flex;
  align-items: center;
  gap: 4px;
  font-variant-numeric: tabular-nums;
}

/* Winner highlighting */
.winner-a .compare-col-a {
  color: var(--accent, #3b82f6);
  font-weight: 600;
}

.winner-b .compare-col-b {
  color: var(--accent-alt, #8b5cf6);
  font-weight: 600;
}

.is-tie .compare-col-a,
.is-tie .compare-col-b {
  color: var(--text-muted, #6b7280);
  font-style: italic;
}

.compare-trophy {
  font-size: 0.85rem;
  line-height: 1;
}

/* Footer */
.compare-footer {
  padding: 12px 16px;
  display: flex;
  justify-content: flex-end;
  border-top: 1px solid var(--border, #e0e0e0);
}
</style>
