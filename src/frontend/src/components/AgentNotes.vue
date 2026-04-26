<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount, onMounted, nextTick } from 'vue'
import { loadNote, saveNote, clearNote } from '@/utils/agentNotes'
import { loadAlias } from '@/utils/agentAliases'
import { buildExport } from '@/utils/agentNotesExport'
import { relativeTimeFromNow } from '@/utils/relativeTime'
import { useToast } from '@/composables/useToast'
import { wrapSelection, prependLine } from '@/utils/markdownInsert'

// ── Props ─────────────────────────────────────────────────────────────────────

const props = defineProps<{
  agentId: string
}>()

// ── State ─────────────────────────────────────────────────────────────────────

const text = ref('')
const updatedAt = ref<number | null>(null)
const relativeLabel = ref('尚未儲存')
const textareaRef = ref<HTMLTextAreaElement | null>(null)

// ── Debounce save ─────────────────────────────────────────────────────────────

let debounceTimer: ReturnType<typeof setTimeout> | null = null
// Track the agentId that owns the pending debounced save
let pendingAgentId: string = ''

function flushPendingSaveFor(agentId: string): void {
  if (debounceTimer !== null && pendingAgentId === agentId) {
    clearTimeout(debounceTimer)
    debounceTimer = null
    pendingAgentId = ''
    const note = saveNote(agentId, text.value)
    updatedAt.value = note.updatedAt
  }
}


function scheduleSave(agentId: string, value: string): void {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer)
  }
  pendingAgentId = agentId
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    pendingAgentId = ''
    const note = saveNote(agentId, value)
    updatedAt.value = note.updatedAt
  }, 800)
}

// ── Load note for current agent ───────────────────────────────────────────────

// Flag: true while we are programmatically loading a note (to suppress auto-save)
let isLoading = false

async function loadForAgent(agentId: string): Promise<void> {
  isLoading = true
  const note = loadNote(agentId)
  text.value = note?.text ?? ''
  updatedAt.value = note?.updatedAt ?? null
  // Wait one tick for the watcher to run (and be suppressed), then unblock
  await nextTick()
  isLoading = false
}

onMounted(() => {
  void loadForAgent(props.agentId)
})

// Watch text changes for auto-save. Skip any change triggered by loadForAgent.
watch(
  () => text.value,
  (newVal) => {
    if (isLoading) return
    scheduleSave(props.agentId, newVal)
  },
)

// Watch agentId changes: flush pending save for previous agent, then load new
watch(
  () => props.agentId,
  (newId, oldId) => {
    // Flush any pending save for the PREVIOUS agent before switching
    flushPendingSaveFor(oldId)
    void loadForAgent(newId)
  },
)

onBeforeUnmount(() => {
  // Save any pending changes for the current agent before unmounting
  flushPendingSaveFor(pendingAgentId || props.agentId)
})

// ── Relative-time refresh ─────────────────────────────────────────────────────

function updateLabel(): void {
  if (updatedAt.value === null) {
    relativeLabel.value = '尚未儲存'
  } else {
    relativeLabel.value = relativeTimeFromNow(updatedAt.value)
  }
}

updateLabel()

const relativeTimer = setInterval(() => {
  updateLabel()
}, 10_000)

watch(updatedAt, () => {
  updateLabel()
})

onBeforeUnmount(() => {
  clearInterval(relativeTimer)
})

// ── Clear ─────────────────────────────────────────────────────────────────────

const toast = useToast()

function onClear(): void {
  if (!window.confirm('確定要清除這個 agent 的筆記嗎？')) return
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  clearNote(props.agentId)
  text.value = ''
  updatedAt.value = null
  toast.info('筆記已清除')
}

// ── Markdown toolbar ──────────────────────────────────────────────────────────

/**
 * Apply a wrap operation (bold/italic/code/link) to the current selection.
 * Restores focus and cursor position after the DOM update.
 */
function applyWrap(prefix: string, suffix: string, placeholder: string): void {
  const ta = textareaRef.value
  if (!ta) return
  const { text: nextText, selectionStart, selectionEnd } = wrapSelection(
    text.value,
    ta.selectionStart,
    ta.selectionEnd,
    prefix,
    suffix,
    placeholder,
  )
  text.value = nextText
  nextTick(() => {
    ta.focus()
    ta.setSelectionRange(selectionStart, selectionEnd)
  })
}

function insertBold(): void {
  applyWrap('**', '**', '粗體文字')
}

function insertItalic(): void {
  applyWrap('*', '*', '斜體文字')
}

function insertCode(): void {
  applyWrap('`', '`', 'code')
}

function insertLink(): void {
  const url = window.prompt('連結 URL:', 'https://')
  if (!url) return
  applyWrap('[', `](${url})`, '連結文字')
}

function insertList(): void {
  const ta = textareaRef.value
  if (!ta) return
  const { text: nextText, selectionStart } = prependLine(text.value, ta.selectionStart, '- ')
  text.value = nextText
  nextTick(() => {
    ta.focus()
    ta.setSelectionRange(selectionStart, selectionStart)
  })
}

// ── Download / Export ─────────────────────────────────────────────────────────

const canExport = computed(() => text.value.trim().length > 0 && updatedAt.value !== null)

function onDownload(): void {
  if (!canExport.value) return
  const alias = loadAlias(props.agentId)
  const { filename, content } = buildExport({
    agentId: props.agentId,
    alias,
    note: { text: text.value, updatedAt: updatedAt.value ?? Date.now() },
  })
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    a.remove()
  } finally {
    URL.revokeObjectURL(url)
  }
  toast.success(`已匯出: ${filename}`)
}
</script>

<template>
  <div class="agent-notes">
    <div class="agent-notes-header">
      <span class="agent-notes-label">📝 筆記</span>
    </div>
    <div class="agent-notes-md-toolbar" role="toolbar" aria-label="Markdown 格式工具列">
      <button class="agent-notes-md-btn" type="button" title="粗體" @click="insertBold">
        <strong>B</strong>
      </button>
      <button class="agent-notes-md-btn" type="button" title="斜體" @click="insertItalic">
        <em>I</em>
      </button>
      <button class="agent-notes-md-btn" type="button" title="行內程式碼" @click="insertCode">
        <code>&lt;&gt;</code>
      </button>
      <button class="agent-notes-md-btn" type="button" title="連結" @click="insertLink">
        🔗
      </button>
      <button class="agent-notes-md-btn agent-notes-md-btn--wide" type="button" title="清單" @click="insertList">
        - 清單
      </button>
    </div>
    <textarea
      ref="textareaRef"
      v-model="text"
      class="agent-notes-textarea"
      rows="6"
      placeholder="在這裡寫下關於這個 agent 的觀察、TODO、context..."
    ></textarea>
    <div class="agent-notes-footer">
      <span class="agent-notes-meta">{{ text.length }} 字 · 上次儲存: {{ relativeLabel }}</span>
      <div class="agent-notes-actions">
        <button
          type="button"
          class="agent-notes-download-btn"
          :disabled="!canExport"
          :title="canExport ? '下載筆記 (.md)' : '筆記為空，無法匯出'"
          @click="onDownload"
        >
          📥 下載
        </button>
        <button
          v-if="text.length > 0 || updatedAt !== null"
          type="button"
          class="agent-notes-clear-btn"
          @click="onClear"
        >
          清除
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.agent-notes {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.agent-notes-header {
  display: flex;
  align-items: center;
}

.agent-notes-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted, #6c7086);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.agent-notes-textarea {
  width: 100%;
  resize: vertical;
  font-size: 12px;
  line-height: 1.55;
  padding: 8px 10px;
  border-radius: 6px;
  border: 1px solid var(--border, #45475a);
  background: var(--bg-secondary, #1e1e2e);
  color: var(--text, #cdd6f4);
  outline: none;
  font-family: inherit;
  transition: border-color 0.15s ease;
  box-sizing: border-box;
}

.agent-notes-textarea::placeholder {
  color: var(--text-muted, #6c7086);
  font-style: italic;
}

.agent-notes-textarea:focus {
  border-color: var(--blue, #89b4fa);
}

.agent-notes-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.agent-notes-meta {
  font-size: 10px;
  color: var(--text-muted, #6c7086);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-notes-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.agent-notes-download-btn {
  background: none;
  border: 1px solid var(--border, #45475a);
  border-radius: 4px;
  color: var(--text-muted, #6c7086);
  font-size: 11px;
  padding: 2px 8px;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    color 0.15s ease;
}

.agent-notes-download-btn:not(:disabled):hover {
  border-color: var(--blue, #89b4fa);
  color: var(--blue, #89b4fa);
}

.agent-notes-download-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.agent-notes-clear-btn {
  background: none;
  border: 1px solid var(--border, #45475a);
  border-radius: 4px;
  color: var(--text-muted, #6c7086);
  font-size: 11px;
  padding: 2px 8px;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    color 0.15s ease;
}

.agent-notes-clear-btn:hover {
  border-color: var(--red, #f38ba8);
  color: var(--red, #f38ba8);
}

/* ── Markdown toolbar ─────────────────────────────────────────────────────── */

.agent-notes-md-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  margin-bottom: 4px;
}

.agent-notes-md-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  background: none;
  border: 1px solid var(--border, #45475a);
  border-radius: 3px;
  color: var(--text-muted, #6c7086);
  font-size: 11px;
  font-weight: 600;
  padding: 2px 6px;
  min-width: 24px;
  line-height: 1.5;
  font-family: inherit;
  transition:
    color 0.15s ease,
    border-color 0.15s ease,
    background 0.15s ease;
}

.agent-notes-md-btn--wide {
  min-width: unset;
  padding-left: 8px;
  padding-right: 8px;
}

.agent-notes-md-btn:hover {
  color: var(--text, #cdd6f4);
  border-color: var(--blue, #89b4fa);
  background: rgba(137, 180, 250, 0.08);
}

.agent-notes-md-btn:focus-visible {
  outline: 2px solid var(--blue, #89b4fa);
  outline-offset: 1px;
}

@media (prefers-reduced-motion: reduce) {
  .agent-notes-md-btn {
    transition: none;
  }
}
</style>
