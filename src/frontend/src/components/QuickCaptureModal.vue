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
import { readClipboardText, isClipboardReadSupported } from '@/utils/clipboardRead'
import { loadDraft, saveDraft, clearDraft } from '@/utils/captureDraft'
import {
  isSpeechRecognitionSupported,
  createSpeechRecognition,
  type SpeechRecognitionWrapper,
} from '@/utils/speechRecognition'

const props = defineProps<{
  currentContext: string
}>()

const { isOpen, close, add, prefillBody } = useQuickCapture()
const toast = useToast()

const text = ref('')
const taRef = ref<HTMLTextAreaElement | null>(null)

// ── Voice input state ─────────────────────────────────────────────────────
const recording = ref(false)
const recognition = ref<SpeechRecognitionWrapper | null>(null)

// Debounce timer handle for draft autosave.
let debounceTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Autosave draft with a 500 ms debounce.
 * The timer is cleared and flushed synchronously on modal close so no
 * pending write fires after the user has already saved/dismissed.
 */
watch(text, (newText) => {
  if (debounceTimer !== null) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    saveDraft(newText)
    debounceTimer = null
  }, 500)
})

// Autofocus textarea when modal opens.
// Clone flow (prefillBody non-empty) takes precedence over any saved draft.
// Normal open (no prefillBody) restores the draft from localStorage.
watch(isOpen, async (visible) => {
  if (visible) {
    if (prefillBody.value) {
      // Clone path — ignore draft; use the prefilled body.
      text.value = prefillBody.value
    } else {
      // Normal open — restore draft (or start empty if no draft).
      text.value = loadDraft()
    }
    await nextTick()
    taRef.value?.focus()
  } else {
    // Modal closing without save — flush pending debounce immediately so the
    // latest keystrokes are not lost, then cancel the timer.
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
    saveDraft(text.value)
  }
})

function handleSave(): void {
  const trimmed = text.value.trim()
  if (!trimmed) return
  add(trimmed, props.currentContext)
  // Clear draft on successful save so it does not reappear next open.
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  clearDraft()
  toast.success('💡 已捕捉')
  close()
}

function handleClose(): void {
  // Stop any active recording before dismissing.
  if (recording.value) {
    recognition.value?.stop()
    recording.value = false
  }
  close()
}

function toggleMic(): void {
  if (recording.value) {
    recognition.value?.stop()
    recording.value = false
    return
  }

  const wrapper = createSpeechRecognition('zh-TW')
  if (!wrapper) {
    toast.warning('此瀏覽器不支援語音輸入')
    return
  }

  wrapper.onResult = (txt: string) => {
    if (!txt) return
    text.value = text.value ? `${text.value}\n${txt}` : txt
  }
  wrapper.onError = (msg: string) => {
    toast.warning(`語音識別錯誤: ${msg}`)
    recording.value = false
  }
  wrapper.onEnd = () => {
    recording.value = false
  }

  recognition.value = wrapper
  wrapper.start()
  recording.value = true
}

async function onPaste(): Promise<void> {
  const txt = await readClipboardText()
  if (txt === null) {
    toast.warning('無法讀取剪貼簿，請檢查瀏覽器權限')
    return
  }
  if (!txt) {
    toast.info('剪貼簿是空的')
    return
  }
  text.value = text.value ? `${text.value}\n${txt}` : txt
  toast.info('已貼入剪貼簿內容')
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
          <div class="qc-body-toolbar">
            <button
              class="qcm-paste"
              :disabled="!isClipboardReadSupported()"
              :title="isClipboardReadSupported() ? '從剪貼簿貼上' : '瀏覽器不支援剪貼簿讀取'"
              type="button"
              @click="onPaste"
            >
              📋 貼上
            </button>
            <button
              class="qcm-mic"
              :class="{ 'is-recording': recording }"
              :disabled="!isSpeechRecognitionSupported()"
              :title="isSpeechRecognitionSupported() ? (recording ? '停止語音輸入' : '開始語音輸入') : '此瀏覽器不支援語音輸入'"
              type="button"
              :aria-pressed="recording"
              aria-label="語音輸入"
              @click="toggleMic"
            >
              🎤 {{ recording ? '錄音中...' : '語音' }}
            </button>
          </div>
          <textarea
            ref="taRef"
            v-model="text"
            class="qc-textarea"
            rows="4"
            placeholder="記下你的想法..."
            aria-label="快速記錄內容"
          />
          <span
            class="qcm-char-count"
            :class="{ 'is-dimmed': !text.length }"
            aria-live="polite"
            aria-atomic="true"
          >{{ text.length }} 字</span>
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

/* ── Body toolbar ─────────────────────────────────────────────────────── */

.qc-body-toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 0.375rem;
}

.qcm-paste {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  cursor: pointer;
  background: none;
  border: 1px solid var(--color-border, #313244);
  border-radius: 0.375rem;
  color: var(--color-muted, #6c7086);
  font-size: 0.75rem;
  font-weight: 500;
  padding: 0.25rem 0.5rem;
  line-height: 1.5;
  transition: color 0.15s, border-color 0.15s, background 0.15s;
}

.qcm-paste:hover:not(:disabled) {
  color: var(--color-text, #cdd6f4);
  border-color: var(--color-accent, #89b4fa);
  background: rgba(137, 180, 250, 0.08);
}

.qcm-paste:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

/* ── Mic button ─────────────────────────────────────────────────────────── */

.qcm-mic {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  cursor: pointer;
  background: none;
  border: 1px solid var(--color-border, #313244);
  border-radius: 0.375rem;
  color: var(--color-muted, #6c7086);
  font-size: 0.75rem;
  font-weight: 500;
  padding: 0.25rem 0.5rem;
  line-height: 1.5;
  transition: color 0.15s, border-color 0.15s, background 0.15s;
}

.qcm-mic:hover:not(:disabled) {
  color: var(--color-text, #cdd6f4);
  border-color: var(--color-accent, #89b4fa);
  background: rgba(137, 180, 250, 0.08);
}

.qcm-mic:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.qcm-mic.is-recording {
  color: #f38ba8;
  border-color: #f38ba8;
  background: rgba(243, 139, 168, 0.1);
  animation: mic-pulse 1.4s ease-in-out infinite;
}

@keyframes mic-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.55;
  }
}

/* ── Char counter ───────────────────────────────────────────────────────── */

.qcm-char-count {
  display: block;
  margin-top: 0.25rem;
  font-size: 0.72rem;
  color: var(--color-muted, #6c7086);
  text-align: right;
  transition: opacity 0.15s;
}

.qcm-char-count.is-dimmed {
  opacity: 0.5;
}

/* ── Reduced motion ─────────────────────────────────────────────────────── */

@media (prefers-reduced-motion: reduce) {
  .qc-overlay,
  .qc-card,
  .qc-btn,
  .qc-textarea,
  .qcm-paste,
  .qcm-mic,
  .qcm-char-count {
    transition: none;
    animation: none;
  }

  /* Keep red border as the only recording indicator when motion is reduced */
  .qcm-mic.is-recording {
    opacity: 1;
  }
}
</style>
