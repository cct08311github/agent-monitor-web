<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRecentAgents } from '@/composables/useRecentAgents'
import { useAgentAliases } from '@/composables/useAgentAliases'

// ---------------------------------------------------------------------------
// Props & emits
// ---------------------------------------------------------------------------

const props = defineProps<{
  currentAgentId: string | null
}>()

const emit = defineEmits<{
  (e: 'select', agentId: string): void
  (e: 'close'): void
}>()

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const { recents, isOpen, close: closePopover } = useRecentAgents()
const { displayName } = useAgentAliases()

const highlightIdx = ref(0)

/** Up to 5 candidates — exclude the currently viewed agent */
const candidates = computed<string[]>(() =>
  recents.value.filter((id) => id !== props.currentAgentId).slice(0, 5),
)

// Reset highlight whenever the list or open state changes
watch([candidates, isOpen], () => {
  highlightIdx.value = 0
})

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function selectAgent(agentId: string): void {
  emit('select', agentId)
  emit('close')
  closePopover()
}

function close(): void {
  emit('close')
  closePopover()
}

// ---------------------------------------------------------------------------
// Keyboard handling (when popover is open)
// ---------------------------------------------------------------------------

function onKeydown(e: KeyboardEvent): void {
  if (!isOpen.value) return

  const len = candidates.value.length

  if (e.key === 'Escape') {
    e.preventDefault()
    close()
    return
  }

  if (e.key === 'ArrowDown') {
    e.preventDefault()
    if (len > 0) highlightIdx.value = (highlightIdx.value + 1) % len
    return
  }

  if (e.key === 'ArrowUp') {
    e.preventDefault()
    if (len > 0) highlightIdx.value = (highlightIdx.value - 1 + len) % len
    return
  }

  if (e.key === 'Enter') {
    e.preventDefault()
    const target = candidates.value[highlightIdx.value]
    if (target) selectAgent(target)
    return
  }

  // 1–5 digit shortcuts
  const digit = parseInt(e.key, 10)
  if (!isNaN(digit) && digit >= 1 && digit <= 5) {
    e.preventDefault()
    const target = candidates.value[digit - 1]
    if (target) selectAgent(target)
    return
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="isOpen"
      class="recent-agents-overlay"
      aria-modal="true"
      role="dialog"
      aria-label="最近瀏覽的 agents"
      @click.self="close"
    >
      <div class="recent-agents-popover">
        <!-- Header -->
        <div class="rap-header">
          <span class="rap-title">最近瀏覽</span>
          <kbd class="rap-hotkey">Cmd+J</kbd>
        </div>

        <!-- Empty state -->
        <div v-if="candidates.length === 0" class="rap-empty">
          尚未瀏覽過任何 agent
        </div>

        <!-- Agent list -->
        <ul v-else class="rap-list" role="listbox">
          <li
            v-for="(agentId, idx) in candidates"
            :key="agentId"
            :class="['rap-item', { 'rap-item--highlighted': idx === highlightIdx }]"
            role="option"
            :aria-selected="idx === highlightIdx"
            @click="selectAgent(agentId)"
            @mouseenter="highlightIdx = idx"
          >
            <span class="rap-index" aria-hidden="true">{{ idx + 1 }}</span>
            <span class="rap-name">{{ displayName(agentId) }}</span>
            <small class="rap-id" :title="agentId">{{ agentId }}</small>
          </li>
        </ul>

        <!-- Footer hint -->
        <div class="rap-footer">
          <span>↑↓ 導航</span>
          <span>Enter 選擇</span>
          <span>1–5 直接跳轉</span>
          <span>Esc 關閉</span>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.recent-agents-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 25vh;
}

.recent-agents-popover {
  width: 360px;
  max-width: calc(100vw - 32px);
  background: var(--bg-card, #1e1e2e);
  border: 1px solid var(--border, #45475a);
  border-radius: var(--radius, 8px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.45);
  overflow: hidden;
}

/* ── Header ── */

.rap-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px 8px;
  border-bottom: 1px solid var(--border, #45475a);
}

.rap-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted, #6c7086);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.rap-hotkey {
  font-size: 10px;
  font-family: monospace;
  padding: 2px 5px;
  border: 1px solid var(--border, #45475a);
  border-radius: 4px;
  color: var(--text-muted, #6c7086);
  background: none;
}

/* ── Empty state ── */

.rap-empty {
  padding: 20px 14px;
  font-size: 13px;
  color: var(--text-muted, #6c7086);
  text-align: center;
}

/* ── List ── */

.rap-list {
  list-style: none;
  margin: 0;
  padding: 6px 0;
}

.rap-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 14px;
  cursor: pointer;
  transition: background-color 0.1s;
}

.rap-item:hover,
.rap-item--highlighted {
  background: var(--bg-hover, rgba(255, 255, 255, 0.06));
}

.rap-index {
  font-size: 10px;
  font-weight: 700;
  color: var(--text-muted, #6c7086);
  min-width: 14px;
  text-align: center;
  flex-shrink: 0;
}

.rap-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text, #cdd6f4);
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rap-id {
  font-size: 10px;
  font-family: monospace;
  color: var(--text-muted, #6c7086);
  max-width: 90px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-shrink: 0;
}

/* ── Footer ── */

.rap-footer {
  display: flex;
  gap: 12px;
  padding: 8px 14px;
  border-top: 1px solid var(--border, #45475a);
  font-size: 10px;
  color: var(--text-muted, #6c7086);
}

/* ── Reduced motion ── */

@media (prefers-reduced-motion: reduce) {
  .rap-item {
    transition: none;
  }
}
</style>
