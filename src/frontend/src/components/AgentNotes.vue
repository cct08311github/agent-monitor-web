<script setup lang="ts">
import { ref, watch, onBeforeUnmount, onMounted, nextTick } from 'vue'
import { loadNote, saveNote, clearNote } from '@/utils/agentNotes'
import { relativeTimeFromNow } from '@/utils/relativeTime'
import { useToast } from '@/composables/useToast'

// ── Props ─────────────────────────────────────────────────────────────────────

const props = defineProps<{
  agentId: string
}>()

// ── State ─────────────────────────────────────────────────────────────────────

const text = ref('')
const updatedAt = ref<number | null>(null)
const relativeLabel = ref('尚未儲存')

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
</script>

<template>
  <div class="agent-notes">
    <div class="agent-notes-header">
      <span class="agent-notes-label">📝 筆記</span>
    </div>
    <textarea
      v-model="text"
      class="agent-notes-textarea"
      rows="6"
      placeholder="在這裡寫下關於這個 agent 的觀察、TODO、context..."
    ></textarea>
    <div class="agent-notes-footer">
      <span class="agent-notes-meta">{{ text.length }} 字 · 上次儲存: {{ relativeLabel }}</span>
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

.agent-notes-clear-btn {
  flex-shrink: 0;
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
</style>
