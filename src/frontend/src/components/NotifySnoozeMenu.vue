<script setup lang="ts">
/**
 * NotifySnoozeMenu — popover with snooze duration options.
 *
 * Props:
 *   open     — whether the popover is visible
 *   isSnoozed — whether a snooze is currently active
 *
 * Emits:
 *   close           — request to close the popover
 *   snooze(ms)      — user selected a duration
 *   cancel          — user cancelled an active snooze
 */
import { watch } from 'vue'
import { SNOOZE_OPTIONS } from '@/utils/notifySnooze'

const props = defineProps<{
  open: boolean
  isSnoozed: boolean
}>()

const emit = defineEmits<{
  close: []
  snooze: [ms: number]
  cancel: []
}>()

function handleSnooze(ms: number): void {
  emit('snooze', ms)
  emit('close')
}

function handleCancel(): void {
  emit('cancel')
  emit('close')
}

function handleBackdrop(): void {
  emit('close')
}

function handleKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.stopPropagation()
    emit('close')
  }
}

watch(
  () => props.open,
  (visible) => {
    if (visible) {
      document.addEventListener('keydown', handleKeydown)
    } else {
      document.removeEventListener('keydown', handleKeydown)
    }
  },
  { immediate: true },
)
</script>

<template>
  <div
    v-if="open"
    class="nsm-backdrop"
    aria-hidden="true"
    @click.self="handleBackdrop"
  />
  <div
    v-if="open"
    class="nsm-popover"
    role="menu"
    aria-label="暫停通知選項"
  >
    <div class="nsm-title">🔕 暫停通知</div>
    <button
      v-for="opt in SNOOZE_OPTIONS"
      :key="opt.ms"
      class="nsm-option"
      role="menuitem"
      @click="handleSnooze(opt.ms)"
    >
      {{ opt.label }}
    </button>
    <div
      v-if="isSnoozed"
      class="nsm-divider"
    />
    <button
      v-if="isSnoozed"
      class="nsm-cancel"
      role="menuitem"
      @click="handleCancel"
    >
      ▶ 立即恢復通知
    </button>
  </div>
</template>

<style scoped>
.nsm-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1199;
}

.nsm-popover {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 0;
  z-index: 1200;
  background: var(--color-surface, #1e1e2e);
  border: 1px solid var(--color-border, #313244);
  border-radius: 0.5rem;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  display: flex;
  flex-direction: column;
  min-width: 140px;
  overflow: hidden;
}

.nsm-title {
  padding: 0.4rem 0.75rem 0.25rem;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-muted, #6c7086);
  user-select: none;
}

.nsm-option,
.nsm-cancel {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0.45rem 0.75rem;
  font-size: 0.8rem;
  text-align: left;
  color: var(--color-text, #cdd6f4);
  transition: background 0.1s;
  white-space: nowrap;
}

.nsm-option:hover,
.nsm-option:focus-visible,
.nsm-cancel:hover,
.nsm-cancel:focus-visible {
  background: var(--color-surface-hover, #313244);
  outline: none;
}

.nsm-cancel {
  color: var(--color-accent, #89b4fa);
}

.nsm-divider {
  height: 1px;
  background: var(--color-border, #313244);
  margin: 0.2rem 0;
}
</style>
