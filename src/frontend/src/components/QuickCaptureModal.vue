<script setup lang="ts">
/**
 * QuickCaptureModal — global quick-note input overlay.
 *
 * Opens when Cmd+Shift+N / Ctrl+Shift+N is pressed (state driven by
 * useQuickCapture). Saves on Cmd+Enter; dismisses on Esc or backdrop click.
 *
 * Does NOT save an empty body — the user must type at least one character.
 */
import { ref, watch, nextTick } from 'vue'
import { useQuickCapture } from '@/composables/useQuickCapture'
import { useToast } from '@/composables/useToast'

const props = defineProps<{
  currentContext: string
}>()

const { isOpen, close, add } = useQuickCapture()
const toast = useToast()

const text = ref('')
const taRef = ref<HTMLTextAreaElement | null>(null)

// Autofocus textarea when modal opens; clear text when it closes
watch(isOpen, async (visible) => {
  if (visible) {
    text.value = ''
    await nextTick()
    taRef.value?.focus()
  }
})

function handleSave(): void {
  const trimmed = text.value.trim()
  if (!trimmed) return
  add(trimmed, props.currentContext)
  toast.success('💡 已捕捉')
  close()
}

function handleClose(): void {
  close()
}

function handleKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.stopPropagation()
    handleClose()
    return
  }
  // Cmd+Enter (macOS) or Ctrl+Enter (Windows/Linux)
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault()
    handleSave()
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="isOpen"
      class="qc-overlay"
      aria-modal="true"
      role="dialog"
      aria-labelledby="qc-title"
      @click.self="handleClose"
    >
      <div class="qc-card" @keydown="handleKeydown">
        <!-- Header -->
        <div class="qc-header">
          <span id="qc-title" class="qc-title">💡 Quick Capture</span>
          <span class="qc-context-label">情境：{{ currentContext }}</span>
        </div>

        <!-- Body -->
        <div class="qc-body">
          <textarea
            ref="taRef"
            v-model="text"
            class="qc-textarea"
            rows="4"
            placeholder="記下你的想法..."
            aria-label="快速記錄內容"
          />
        </div>

        <!-- Footer -->
        <div class="qc-footer">
          <button
            class="qc-btn qc-btn--save"
            :disabled="!text.trim()"
            @click="handleSave"
          >
            儲存
            <kbd class="qc-kbd">⌘↵</kbd>
          </button>
          <button class="qc-btn qc-btn--cancel" @click="handleClose">
            取消
            <kbd class="qc-kbd">Esc</kbd>
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.qc-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.qc-card {
  background: var(--color-surface, #1e1e2e);
  color: var(--color-text, #cdd6f4);
  border: 1px solid var(--color-border, #313244);
  border-radius: 0.75rem;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  width: 100%;
  max-width: 480px;
  display: flex;
  flex-direction: column;
  gap: 0;
}

/* ── Header ─────────────────────────────────────────────────────────────── */

.qc-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.875rem 1.25rem 0.625rem;
  border-bottom: 1px solid var(--color-border, #313244);
}

.qc-title {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--color-text, #cdd6f4);
}

.qc-context-label {
  font-size: 0.75rem;
  color: var(--color-muted, #6c7086);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 60%;
  text-align: right;
}

/* ── Body ────────────────────────────────────────────────────────────────── */

.qc-body {
  padding: 0.875rem 1.25rem;
}

.qc-textarea {
  width: 100%;
  resize: vertical;
  background: var(--color-surface-raised, #181825);
  color: var(--color-text, #cdd6f4);
  border: 1px solid var(--color-border, #313244);
  border-radius: 0.5rem;
  padding: 0.625rem 0.75rem;
  font-size: 0.9375rem;
  line-height: 1.5;
  font-family: inherit;
  box-sizing: border-box;
  transition: border-color 0.15s;
}

.qc-textarea:focus {
  outline: none;
  border-color: var(--color-accent, #89b4fa);
}

.qc-textarea::placeholder {
  color: var(--color-muted, #6c7086);
}

/* ── Footer ─────────────────────────────────────────────────────────────── */

.qc-footer {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 1.25rem 0.875rem;
  border-top: 1px solid var(--color-border, #313244);
}

.qc-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  cursor: pointer;
  border-radius: 0.375rem;
  font-size: 0.8125rem;
  font-weight: 600;
  padding: 0.35rem 0.75rem;
  transition: opacity 0.15s, background 0.15s, border-color 0.15s, color 0.15s;
  line-height: 1.5;
}

.qc-btn--save {
  background: var(--color-accent, #89b4fa);
  color: #1e1e2e;
  border: 1px solid transparent;
}

.qc-btn--save:hover:not(:disabled) {
  opacity: 0.88;
}

.qc-btn--save:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.qc-btn--cancel {
  background: none;
  border: 1px solid var(--color-border, #313244);
  color: var(--color-muted, #6c7086);
}

.qc-btn--cancel:hover {
  color: var(--color-text, #cdd6f4);
  border-color: var(--color-text, #cdd6f4);
}

.qc-kbd {
  display: inline-block;
  padding: 0 4px;
  font-family: ui-monospace, 'SFMono-Regular', Menlo, monospace;
  font-size: 10px;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 3px;
  line-height: 1.5;
  white-space: nowrap;
}

/* ── Reduced motion ─────────────────────────────────────────────────────── */

@media (prefers-reduced-motion: reduce) {
  .qc-overlay,
  .qc-card,
  .qc-btn,
  .qc-textarea {
    transition: none;
    animation: none;
  }
}
</style>
