<script setup lang="ts">
import { ref, watch, nextTick, onUnmounted } from 'vue'
import { useConfirm } from '@/composables/useConfirm'
import { createFocusTrap } from '@/lib/focusTrap'

const { state, handleConfirm, handleCancel } = useConfirm()
const dialogRef = ref<HTMLDivElement | null>(null)
const trap = createFocusTrap()

watch(
  () => state.value.visible,
  async (visible) => {
    if (visible) {
      await nextTick()
      if (dialogRef.value) {
        trap.activate(dialogRef.value, handleCancel)
      }
    } else {
      trap.deactivate()
    }
  },
)

onUnmounted(() => {
  trap.deactivate()
})
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
      <div
        ref="dialogRef"
        :class="['confirm-dialog', 'confirm-' + (state.options.type || 'warning')]"
      >
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
