<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { api } from '@/composables/useApi'
import { showToast } from '@/composables/useToast'
import { createFocusTrap } from '@/lib/focusTrap'
import SessionReplay from './SessionReplay.vue'

const props = defineProps<{
  agentId: string
  sessionId: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

interface SessionMessage {
  role: string
  text?: string
  toolUses?: string[]
}

const TRUNCATE_LIMIT = 2000

const messages = ref<SessionMessage[]>([])
const loading = ref(true)
const error = ref(false)
const searchQuery = ref('')
const expandedIndices = ref<Set<number>>(new Set())

async function fetchMessages() {
  loading.value = true
  error.value = false
  try {
    const data = (await api.get(
      `/api/agents/${encodeURIComponent(props.agentId)}/sessions/${encodeURIComponent(props.sessionId)}`
    )) as { success?: boolean; messages?: SessionMessage[] }
    messages.value = data?.messages ?? []
  } catch {
    error.value = true
  } finally {
    loading.value = false
  }
}

// Focus trap — WCAG 2.4.3 focus order
const dialogRef = ref<HTMLDivElement | null>(null)
const trap = createFocusTrap()

onMounted(() => {
  fetchMessages()
  if (dialogRef.value) trap.activate(dialogRef.value, () => emit('close'))
})
onBeforeUnmount(() => { trap.deactivate() })

function handleOverlayClick(event: MouseEvent) {
  if ((event.target as HTMLElement).classList.contains('modal-overlay')) {
    emit('close')
  }
}

function truncateText(text: string): string {
  if (text.length <= TRUNCATE_LIMIT) return text
  return text.slice(0, TRUNCATE_LIMIT) + '\n…（已截斷）'
}

function isTextTruncated(text: string | undefined): boolean {
  return typeof text === 'string' && text.length > TRUNCATE_LIMIT
}

function showFull(i: number): void {
  const next = new Set(expandedIndices.value)
  next.add(i)
  expandedIndices.value = next
}

function displayText(msg: SessionMessage, i: number): string {
  if (!msg.text) return ''
  if (expandedIndices.value.has(i) || msg.text.length <= TRUNCATE_LIMIT) {
    return msg.text
  }
  return truncateText(msg.text)
}

async function copyMessage(msg: SessionMessage): Promise<void> {
  try {
    await navigator.clipboard.writeText(msg.text ?? '')
    showToast('✅ 已複製', 'success')
  } catch {
    showToast('❌ 複製失敗', 'error')
  }
}

const filteredMessages = computed<Array<{ msg: SessionMessage; originalIndex: number }>>(() => {
  const q = searchQuery.value.toLowerCase().trim()
  return messages.value
    .map((msg, i) => ({ msg, originalIndex: i }))
    .filter(({ msg }) => {
      if (!q) return true
      const textMatch = msg.text?.toLowerCase().includes(q) ?? false
      const roleMatch = msg.role.toLowerCase().includes(q)
      const toolMatch = msg.toolUses?.some(t => t.toLowerCase().includes(q)) ?? false
      return textMatch || roleMatch || toolMatch
    })
})

// Replay mode internal state
const replayMode = ref(false)

function openReplay(): void {
  replayMode.value = true
}

function closeReplay(): void {
  replayMode.value = false
}
</script>

<template>
  <!-- Session Replay mode — replaces viewer while active -->
  <SessionReplay
    v-if="replayMode"
    :agent-id="agentId"
    :session-id="sessionId"
    @close="closeReplay"
  />

  <!-- Standard viewer -->
  <div v-else class="modal-overlay" style="display:flex" @click="handleOverlayClick">
    <div ref="dialogRef" class="modal-content" role="dialog" aria-modal="true" style="max-width:700px;width:95%;max-height:80vh;display:flex;flex-direction:column">
      <!-- Header -->
      <div class="modal-header" style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--border-color);flex-shrink:0">
        <h3 style="margin:0;font-size:14px;font-weight:600">💬 {{ sessionId.slice(-12) }}</h3>
        <button class="modal-close ctrl-btn" @click="$emit('close')" aria-label="關閉">✕</button>
      </div>

      <!-- Search bar -->
      <div class="sv-search-bar" style="padding:8px 16px;border-bottom:1px solid var(--border-color);flex-shrink:0;display:flex;align-items:center;gap:8px">
        <input
          v-model="searchQuery"
          class="sv-search-input"
          type="search"
          placeholder="搜尋訊息…"
          aria-label="搜尋訊息"
          style="flex:1;padding:5px 10px;border-radius:6px;border:1px solid var(--border-color);background:var(--bg-muted);color:var(--text-primary);font-size:13px"
        />
        <span v-if="!loading && !error && messages.length > 0" class="sv-count" style="font-size:12px;color:var(--text-muted);white-space:nowrap">
          顯示 {{ filteredMessages.length }} / 共 {{ messages.length }} 則
        </span>
      </div>

      <!-- Body -->
      <div style="flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px">
        <!-- Loading -->
        <div v-if="loading" style="color:var(--text-muted);text-align:center;padding:24px">載入中…</div>

        <!-- Error -->
        <div v-else-if="error" style="color:var(--text-muted);text-align:center;padding:24px">
          ⚠️ 載入失敗<br />
          <a href="#" @click.prevent="fetchMessages" style="color:var(--blue, #5a5aeb);font-size:13px;margin-top:8px;display:inline-block">重試</a>
        </div>

        <!-- Empty (no messages) -->
        <div v-else-if="messages.length === 0" style="color:var(--text-muted);text-align:center;padding:24px">無訊息記錄</div>

        <!-- No search results -->
        <div v-else-if="filteredMessages.length === 0" class="sv-no-results" style="color:var(--text-muted);text-align:center;padding:24px">
          找不到符合「{{ searchQuery }}」的訊息
        </div>

        <!-- Messages -->
        <template v-else>
          <div
            v-for="{ msg, originalIndex } in filteredMessages"
            :key="originalIndex"
            class="sv-message"
            :style="`position:relative;margin-bottom:10px;padding:8px 12px;border-radius:8px;font-size:13px;line-height:1.5;max-width:90%;${msg.role === 'user' ? 'margin-left:auto;background:var(--blue);color:#fff;' : 'background:var(--bg-muted);color:var(--text-primary);'}`"
          >
            <!-- Role label + copy button row -->
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
              <span style="font-size:10px;font-weight:600;opacity:0.7">
                {{ msg.role.toUpperCase() }}
              </span>
              <button
                class="sv-copy-btn"
                :aria-label="`複製 ${msg.role} 訊息`"
                style="background:none;border:none;cursor:pointer;padding:0 2px;font-size:14px;opacity:0.6;line-height:1"
                @click="copyMessage(msg)"
              >📋</button>
            </div>
            <!-- Text content -->
            <div v-if="msg.text" style="white-space:pre-wrap;word-break:break-word">
              {{ displayText(msg, originalIndex) }}
            </div>
            <!-- Expand button (only shown when truncated and not yet expanded) -->
            <div
              v-if="isTextTruncated(msg.text) && !expandedIndices.has(originalIndex)"
              style="margin-top:6px"
            >
              <button
                class="sv-expand-btn"
                style="background:none;border:none;cursor:pointer;font-size:12px;padding:0;text-decoration:underline;opacity:0.8"
                :style="msg.role === 'user' ? 'color:#fff' : 'color:var(--blue, #5a5aeb)'"
                @click="showFull(originalIndex)"
              >
                展開全文
              </button>
            </div>
            <!-- Tool uses -->
            <div v-if="msg.toolUses && msg.toolUses.length > 0" style="margin-top:4px;font-size:11px;opacity:0.75;font-family:monospace">
              🔧 {{ msg.toolUses.join(', ') }}
            </div>
          </div>
        </template>
      </div>

      <!-- Footer: Replay button -->
      <div v-if="!loading && !error && messages.length > 0" class="sv-footer">
        <button class="sv-replay-btn ctrl-btn" aria-label="開啟 Replay 模式" @click="openReplay">
          Replay 模式 ▶
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sv-copy-btn:hover {
  opacity: 1 !important;
}

.sv-expand-btn:hover {
  opacity: 1 !important;
}

.sv-search-input:focus {
  outline: none;
  border-color: var(--blue, #5a5aeb);
}

.sv-footer {
  padding: 8px 16px;
  border-top: 1px solid var(--border-color);
  display: flex;
  justify-content: flex-end;
  flex-shrink: 0;
}

.sv-replay-btn {
  font-size: 13px;
  padding: 5px 14px;
  border-radius: 6px;
  border: 1px solid var(--border-color);
  background: var(--bg-muted);
  color: var(--text-primary);
  cursor: pointer;
  transition: background 0.15s;
}

.sv-replay-btn:hover {
  background: var(--blue, #5a5aeb);
  color: #fff;
  border-color: var(--blue, #5a5aeb);
}
</style>
