<script setup lang="ts">
import { useConfirm } from '@/composables/useConfirm'

const { state, handleConfirm, handleCancel } = useConfirm()
</script>

<template>
  <Teleport to="body">
    <div
      v-if="state.visible"
      class="confirm-overlay confirm-visible"
      role="dialog"
      aria-modal="true"
      :aria-label="state.options.title"
    >
      <div :class="['confirm-dialog', 'confirm-' + (state.options.type || 'warning')]">
        <div class="confirm-header">
          <span class="confirm-icon">{{ state.options.type === 'danger' ? '🚨' : '⚠️' }}</span>
          <h3 class="confirm-title">{{ state.options.title }}</h3>
        </div>
        <p class="confirm-message">{{ state.options.message }}</p>
        <div class="confirm-actions">
          <button class="confirm-cancel-btn" @click="handleCancel">{{ state.options.cancelLabel }}</button>
          <button :class="'confirm-ok-' + (state.options.type || 'warning')" @click="handleConfirm">{{ state.options.confirmLabel }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
