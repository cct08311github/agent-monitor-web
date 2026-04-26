<script setup lang="ts">
import { SNOOZE_DURATIONS } from '@/utils/alertSnooze'

// ---------------------------------------------------------------------------
// Props & emits
// ---------------------------------------------------------------------------

const props = defineProps<{
  count: number
}>()

const emit = defineEmits<{
  (e: 'snooze', durationMs: number): void
  (e: 'clear'): void
}>()

function onSnooze(ms: number): void {
  emit('snooze', ms)
}

function onClear(): void {
  emit('clear')
}
</script>

<template>
  <Teleport to="body">
    <Transition name="bulk-bar">
      <div
        v-if="props.count > 0"
        class="bulk-action-bar"
        role="toolbar"
        aria-label="批次操作工具列"
        data-testid="bulk-action-bar"
      >
        <span class="bulk-action-bar__count">已選 {{ props.count }} 個</span>
        <span class="bulk-action-bar__sep" aria-hidden="true">·</span>
        <span class="bulk-action-bar__label">Snooze：</span>
        <button
          v-for="d in SNOOZE_DURATIONS"
          :key="d.ms"
          class="bulk-action-bar__btn"
          :title="`Snooze ${props.count} 個 alert ${d.label}`"
          @click="onSnooze(d.ms)"
        >
          {{ d.label }}
        </button>
        <span class="bulk-action-bar__divider" aria-hidden="true" />
        <button
          class="bulk-action-bar__btn bulk-action-bar__btn--clear"
          title="清除選取"
          @click="onClear"
        >
          ✕ 清除
        </button>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.bulk-action-bar {
  position: fixed;
  left: 50%;
  bottom: 16px;
  transform: translateX(-50%);
  z-index: 80;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: var(--color-surface-3, #2e2e2e);
  border: 1px solid var(--color-border, #444);
  border-radius: 10px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4);
  white-space: nowrap;
  font-size: 13px;
  color: var(--color-text, #e0e0e0);
  min-width: 0;
}

.bulk-action-bar__count {
  font-weight: 600;
  color: var(--color-accent, #3b82f6);
}

.bulk-action-bar__sep {
  color: var(--color-text-muted, #888);
  margin: 0 2px;
}

.bulk-action-bar__label {
  color: var(--color-text-muted, #aaa);
  font-size: 12px;
}

.bulk-action-bar__btn {
  padding: 4px 9px;
  border-radius: 5px;
  border: 1px solid var(--color-border, #555);
  background: var(--color-surface-2, #242424);
  color: var(--color-text, #e0e0e0);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition:
    background 0.12s,
    opacity 0.12s;
}

.bulk-action-bar__btn:hover {
  background: var(--color-accent, #3b82f6);
  color: #fff;
  border-color: transparent;
}

.bulk-action-bar__btn--clear {
  color: var(--color-text-muted, #aaa);
  border-color: transparent;
  background: transparent;
}

.bulk-action-bar__btn--clear:hover {
  background: var(--color-surface-2, #242424);
  color: var(--color-text, #e0e0e0);
}

.bulk-action-bar__divider {
  width: 1px;
  height: 18px;
  background: var(--color-border, #444);
  margin: 0 4px;
}

/* ── Transition ─────────────────────────────────────────────────────────── */

.bulk-bar-enter-active,
.bulk-bar-leave-active {
  transition:
    opacity 200ms ease,
    transform 200ms ease;
}

.bulk-bar-enter-from {
  opacity: 0;
  transform: translate(-50%, 100%);
}

.bulk-bar-leave-to {
  opacity: 0;
  transform: translate(-50%, 100%);
}

@media (prefers-reduced-motion: reduce) {
  .bulk-bar-enter-active,
  .bulk-bar-leave-active {
    transition: opacity 150ms;
  }

  .bulk-bar-enter-from,
  .bulk-bar-leave-to {
    transform: translate(-50%, 0);
  }
}
</style>
