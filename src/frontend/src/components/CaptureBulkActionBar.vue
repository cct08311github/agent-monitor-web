<script setup lang="ts">
// ---------------------------------------------------------------------------
// CaptureBulkActionBar — floating bulk action bar for QuickCaptureList.
//
// Appears when ≥1 capture is selected; offers archive, unarchive (when any
// selected capture is archived), pin-toggle, delete, and clear-selection.
// ---------------------------------------------------------------------------

const props = defineProps<{
  count: number
  hasArchived?: boolean
}>()

const emit = defineEmits<{
  (e: 'archive'): void
  (e: 'unarchive'): void
  (e: 'pin-toggle'): void
  (e: 'delete'): void
  (e: 'clear'): void
}>()
</script>

<template>
  <Teleport to="body">
    <Transition name="capture-bulk-bar">
      <div
        v-if="props.count > 0"
        class="capture-bulk-bar"
        role="toolbar"
        aria-label="Capture 批次操作工具列"
        data-testid="capture-bulk-action-bar"
      >
        <span class="capture-bulk-bar__count">已選 {{ props.count }} 個</span>
        <span class="capture-bulk-bar__sep" aria-hidden="true">·</span>

        <button
          v-if="!props.hasArchived"
          class="capture-bulk-bar__btn"
          :title="`封存 ${props.count} 個 capture`"
          @click="emit('archive')"
        >📦 封存</button>

        <button
          v-if="props.hasArchived"
          class="capture-bulk-bar__btn"
          :title="`還原 ${props.count} 個 capture`"
          @click="emit('unarchive')"
        >還原</button>

        <button
          class="capture-bulk-bar__btn"
          :title="`切換 ${props.count} 個 capture 的釘選狀態`"
          @click="emit('pin-toggle')"
        >📌 切換釘選</button>

        <button
          class="capture-bulk-bar__btn capture-bulk-bar__btn--danger"
          :title="`刪除 ${props.count} 個 capture`"
          @click="emit('delete')"
        >✕ 刪除</button>

        <span class="capture-bulk-bar__divider" aria-hidden="true" />

        <button
          class="capture-bulk-bar__btn capture-bulk-bar__btn--clear"
          title="清除選取"
          @click="emit('clear')"
        >✕ 清除</button>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.capture-bulk-bar {
  position: fixed;
  left: 50%;
  bottom: 16px;
  transform: translateX(-50%);
  z-index: 1300;
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

.capture-bulk-bar__count {
  font-weight: 600;
  color: var(--color-accent, #3b82f6);
}

.capture-bulk-bar__sep {
  color: var(--color-text-muted, #888);
  margin: 0 2px;
}

.capture-bulk-bar__btn {
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

.capture-bulk-bar__btn:hover {
  background: var(--color-accent, #3b82f6);
  color: #fff;
  border-color: transparent;
}

.capture-bulk-bar__btn--danger:hover {
  background: var(--red, #ef5f5f);
  color: #fff;
  border-color: transparent;
}

.capture-bulk-bar__btn--clear {
  color: var(--color-text-muted, #aaa);
  border-color: transparent;
  background: transparent;
}

.capture-bulk-bar__btn--clear:hover {
  background: var(--color-surface-2, #242424);
  color: var(--color-text, #e0e0e0);
}

.capture-bulk-bar__divider {
  width: 1px;
  height: 18px;
  background: var(--color-border, #444);
  margin: 0 4px;
}

/* ── Transition ─────────────────────────────────────────────────────────── */

.capture-bulk-bar-enter-active,
.capture-bulk-bar-leave-active {
  transition:
    opacity 200ms ease,
    transform 200ms ease;
}

.capture-bulk-bar-enter-from {
  opacity: 0;
  transform: translate(-50%, 100%);
}

.capture-bulk-bar-leave-to {
  opacity: 0;
  transform: translate(-50%, 100%);
}

@media (prefers-reduced-motion: reduce) {
  .capture-bulk-bar-enter-active,
  .capture-bulk-bar-leave-active {
    transition: opacity 150ms;
  }

  .capture-bulk-bar-enter-from,
  .capture-bulk-bar-leave-to {
    transform: translate(-50%, 0);
  }
}
</style>
