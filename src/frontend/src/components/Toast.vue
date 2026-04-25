<script setup lang="ts">
import type { ToastEntry } from '@/composables/useToast'

const props = defineProps<{
  entry: ToastEntry
}>()

const emit = defineEmits<{
  (e: 'dismiss'): void
}>()

function handleAction(): void {
  props.entry.onAction?.()
  emit('dismiss')
}

function handleClose(): void {
  emit('dismiss')
}
</script>

<template>
  <div
    class="toast"
    :class="`toast--${entry.variant}`"
    :role="entry.variant === 'error' ? 'alert' : 'status'"
    :aria-live="entry.variant === 'error' ? 'assertive' : 'polite'"
    aria-atomic="true"
  >
    <!-- Variant icon -->
    <span class="toast__icon" aria-hidden="true">
      <!-- success -->
      <svg v-if="entry.variant === 'success'" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="8" cy="8" r="7.5" stroke="currentColor"/>
        <path d="M4.5 8L7 10.5L11.5 5.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <!-- info -->
      <svg v-else-if="entry.variant === 'info'" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="8" cy="8" r="7.5" stroke="currentColor"/>
        <path d="M8 7V11M8 5V5.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
      <!-- warning -->
      <svg v-else-if="entry.variant === 'warning'" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M7.13 2.5L1.14 12.5A1 1 0 0 0 2 14H14a1 1 0 0 0 .86-1.5L8.87 2.5a1 1 0 0 0-1.74 0Z" stroke="currentColor" stroke-linejoin="round"/>
        <path d="M8 6V9M8 11V11.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
      <!-- error -->
      <svg v-else viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="8" cy="8" r="7.5" stroke="currentColor"/>
        <path d="M5.5 5.5L10.5 10.5M10.5 5.5L5.5 10.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
    </span>

    <!-- Message -->
    <span class="toast__message">{{ entry.message }}</span>

    <!-- Optional action button -->
    <button
      v-if="entry.actionLabel"
      class="toast__action"
      type="button"
      @click="handleAction"
    >
      {{ entry.actionLabel }}
    </button>

    <!-- Close button -->
    <button
      class="toast__close"
      type="button"
      aria-label="關閉通知"
      @click="handleClose"
    >
      <svg viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M1.5 1.5L10.5 10.5M10.5 1.5L1.5 10.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
    </button>
  </div>
</template>

<style scoped>
.toast {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: var(--radius-sm, 6px);
  border-left: 3px solid currentColor;
  background: var(--bg-elevated, #222225);
  color: var(--text-primary, #ededef);
  box-shadow: var(--shadow-md, 0 2px 8px rgba(0, 0, 0, 0.4));
  min-width: 240px;
  max-width: 420px;
  pointer-events: all;
  font-size: 0.875rem;
  line-height: 1.4;
}

/* Variant colour overrides — icon + border use the semantic colour */
.toast--success {
  color: var(--green, #45e0a8);
  background: var(--bg-elevated, #222225);
  border-color: var(--green, #45e0a8);
}

.toast--info {
  color: var(--accent, #7c7cff);
  background: var(--bg-elevated, #222225);
  border-color: var(--accent, #7c7cff);
}

.toast--warning {
  color: var(--orange, #e5a53d);
  background: var(--bg-elevated, #222225);
  border-color: var(--orange, #e5a53d);
}

.toast--error {
  color: var(--red, #ef5f5f);
  background: var(--bg-elevated, #222225);
  border-color: var(--red, #ef5f5f);
}

/* Force message text back to primary */
.toast__message {
  flex: 1;
  color: var(--text-primary, #ededef);
  word-break: break-word;
}

.toast__icon {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.toast__icon svg {
  width: 16px;
  height: 16px;
}

.toast__action {
  flex-shrink: 0;
  background: none;
  border: 1px solid currentColor;
  border-radius: var(--radius-sm, 4px);
  color: inherit;
  font-size: 0.75rem;
  font-weight: 600;
  padding: 2px 8px;
  cursor: pointer;
  transition: opacity 0.1s;
}

.toast__action:hover {
  opacity: 0.8;
}

.toast__close {
  flex-shrink: 0;
  background: none;
  border: none;
  padding: 2px;
  cursor: pointer;
  color: var(--text-muted, #8a8a92);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 2px;
  transition: color 0.1s;
}

.toast__close:hover {
  color: var(--text-primary, #ededef);
}

.toast__close svg {
  width: 10px;
  height: 10px;
}

/* Mobile: stretch to full width */
@media (max-width: 639px) {
  .toast {
    min-width: 0;
    max-width: none;
    border-radius: 0;
    border-left-width: 4px;
  }
}
</style>
