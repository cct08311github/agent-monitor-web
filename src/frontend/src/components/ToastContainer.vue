<script setup lang="ts">
import { useToast } from '@/composables/useToast'
import Toast from '@/components/Toast.vue'

const toast = useToast()
</script>

<template>
  <Teleport to="body">
    <div
      class="toast-container"
      aria-live="polite"
      aria-atomic="false"
      aria-label="通知"
    >
      <TransitionGroup name="toast" tag="div" class="toast-list">
        <Toast
          v-for="entry in toast.queue.value"
          :key="entry.id"
          :entry="entry"
          @dismiss="toast.dismiss(entry.id)"
        />
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-container {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 1000;
  pointer-events: none;
}

.toast-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-end;
}

/* TransitionGroup animations */
.toast-enter-active,
.toast-leave-active {
  transition: transform 0.25s ease, opacity 0.25s ease;
}

.toast-enter-from {
  transform: translateX(120%);
  opacity: 0;
}

.toast-leave-to {
  transform: translateX(120%);
  opacity: 0;
}

/* Mobile: full-width at top */
@media (max-width: 639px) {
  .toast-container {
    right: 0;
    left: 0;
    bottom: auto;
    top: 0;
  }

  .toast-list {
    align-items: stretch;
  }

  .toast-enter-from {
    transform: translateY(-100%);
    opacity: 0;
  }

  .toast-leave-to {
    transform: translateY(-100%);
    opacity: 0;
  }
}

/* Respect reduced motion preference */
@media (prefers-reduced-motion: reduce) {
  .toast-enter-active,
  .toast-leave-active {
    transition: opacity 0.15s ease;
  }

  .toast-enter-from,
  .toast-leave-to {
    transform: none;
  }
}
</style>
