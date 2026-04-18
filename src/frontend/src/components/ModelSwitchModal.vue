<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { api } from '@/composables/useApi'
import { showToast } from '@/composables/useToast'
import { confirm as showConfirm } from '@/composables/useConfirm'
import { createFocusTrap } from '@/lib/focusTrap'

// ---------------------------------------------------------------------------
// Props & emits
// ---------------------------------------------------------------------------

const props = defineProps<{
  agentId: string
  currentModel: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'switched', newModel: string): void
}>()

// ---------------------------------------------------------------------------
// Model options
// ---------------------------------------------------------------------------

const modelOptions = [
  'google/gemini-2.5-flash',
  'google/gemini-2.5-pro',
  'deepseek/deepseek-chat',
  'anthropic/claude-sonnet-4',
  'anthropic/claude-haiku-4',
] as const

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const selectedModel = ref<string>('')
const switching = ref<boolean>(false)

// ---------------------------------------------------------------------------
// Confirm switch
// ---------------------------------------------------------------------------

async function confirm(): Promise<void> {
  if (!selectedModel.value || switching.value) return

  // Validate model name format
  if (!/^[A-Za-z0-9._/-]+$/.test(selectedModel.value)) {
    showToast('❌ 無效的模型名稱', 'error')
    return
  }

  // Validate agent ID
  if (!/^[A-Za-z0-9_-]+$/.test(props.agentId)) {
    showToast('❌ 無效的 Agent ID', 'error')
    return
  }

  const ok = await showConfirm({
    type: 'warning',
    title: '切換模型',
    message: `確認將 ${props.agentId} 的模型從「${props.currentModel || '未知'}」切換為「${selectedModel.value}」？`,
    confirmLabel: '切換',
  })
  if (!ok) return

  switching.value = true
  try {
    await api.post('/api/command', {
      command: 'switch-model',
      agentId: props.agentId,
      model: selectedModel.value,
    })
    emit('switched', selectedModel.value)
    emit('close')
  } catch (err) {
    const msg = err instanceof Error ? err.message : '切換失敗'
    showToast('❌ 切換失敗: ' + msg, 'error')
  } finally {
    switching.value = false
  }
}

// Focus trap — WCAG 2.4.3 focus order
const dialogRef = ref<HTMLDivElement | null>(null)
const trap = createFocusTrap()
onMounted(() => {
  if (dialogRef.value) trap.activate(dialogRef.value, () => emit('close'))
})
onBeforeUnmount(() => { trap.deactivate() })
</script>

<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div ref="dialogRef" class="modal-content" role="dialog" aria-modal="true" style="max-width: 400px">
      <!-- Header -->
      <div class="modal-header">
        <span>🔄 切換模型</span>
        <button class="modal-close" @click="$emit('close')">✕</button>
      </div>

      <!-- Body -->
      <div style="padding: 16px">
        <p style="color: var(--text-muted); font-size: 13px; margin-bottom: 12px">
          Agent: {{ agentId }} | 目前模型: {{ currentModel || '未知' }}
        </p>

        <select
          v-model="selectedModel"
          style="
            width: 100%;
            padding: 8px;
            border-radius: 6px;
            border: 1px solid var(--border);
          "
        >
          <option value="">選擇模型...</option>
          <option v-for="m in modelOptions" :key="m" :value="m">{{ m }}</option>
        </select>

        <div style="display: flex; gap: 8px; margin-top: 16px">
          <button class="ctrl-btn" style="flex: 1" @click="$emit('close')">取消</button>
          <button
            class="ctrl-btn accent"
            style="flex: 1"
            :disabled="!selectedModel || switching"
            @click="confirm"
          >
            {{ switching ? '切換中...' : '確認切換' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
