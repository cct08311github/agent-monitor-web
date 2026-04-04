<script setup lang="ts">
import { useToast } from '@/composables/useToast'

const { toasts, dismissToast, ICONS } = useToast()
</script>

<template>
  <div id="toast-container" aria-live="polite" role="status">
    <div
      v-for="toast in toasts"
      :key="toast.id"
      :class="['toast-v2', 'toast-' + toast.type, 'toast-visible']"
    >
      <span class="toast-icon">{{ ICONS[toast.type] || 'ℹ️' }}</span>
      <span class="toast-msg">{{ toast.message }}</span>
      <span class="toast-actions">
        <button
          v-if="toast.retryFn"
          class="toast-retry-btn"
          @click="toast.retryFn?.(); dismissToast(toast.id)"
        >重試</button>
        <button
          class="toast-close-btn"
          aria-label="關閉通知"
          @click="dismissToast(toast.id)"
        >✕</button>
      </span>
    </div>
  </div>
</template>
