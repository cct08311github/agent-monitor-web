<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { api } from '@/composables/useApi'
import { showToast } from '@/composables/useToast'
import { createFocusTrap } from '@/lib/focusTrap'
import SessionReplay from './SessionReplay.vue'
import {
  loadAnnotations,
  saveAnnotation,
  type SessionAnnotation,
} from '@/utils/sessionAnnotations'
import { buildStory, storyIcon } from '@/utils/sessionStory'

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
const annotations = ref<SessionAnnotation[]>([])

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
  annotations.value = loadAnnotations(props.agentId, props.sessionId)
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

const annotationByIndex = computed<Map<number, SessionAnnotation>>(() => {
  const map = new Map<number, SessionAnnotation>()
  for (const a of annotations.value) {
    map.set(a.msgIndex, a)
  }
  return map
})

function promptAnnotate(msgIndex: number): void {
  const existing = annotationByIndex.value.get(msgIndex)?.note ?? ''
  const note = window.prompt('輸入 note (留空刪除)：', existing)
  if (note === null) return // cancelled
  annotations.value = saveAnnotation(props.agentId, props.sessionId, msgIndex, note)
  if (note.trim()) {
    showToast('📝 annotation 已更新', 'success')
  } else {
    showToast('🗑️ 已刪除', 'success')
  }
}

// Story / Raw toggle
const viewMode = ref<'raw' | 'story'>('raw')

const story = computed(() => buildStory(messages.value))

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
        <div style="display:flex;align-items:center;gap:8px">
          <button
            v-if="!loading && !error && messages.length > 0"
            class="sv-story-toggle-btn ctrl-btn"
            :aria-label="viewMode === 'story' ? '切換回原始訊息' : '切換到敘事模式'"
            @click="viewMode = viewMode === 'story' ? 'raw' : 'story'"
          >{{ viewMode === 'story' ? '📜 Raw' : '📖 Story' }}</button>
          <button class="modal-close ctrl-btn" @click="$emit('close')" aria-label="關閉">✕</button>
        </div>
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

        <!-- Story mode -->
        <template v-else-if="viewMode === 'story'">
          <div v-if="story.length === 0" style="color:var(--text-muted);text-align:center;padding:24px">無敘事可生成</div>
          <div v-else class="story-list">
            <div
              v-for="step in story"
              :key="step.index"
              :class="['story-step', `story-step--${step.type}`]"
            >
              <span class="story-icon">{{ storyIcon(step.type) }}</span>
              <span class="story-text">{{ step.text }}</span>
            </div>
          </div>
        </template>

        <!-- Messages (raw mode) -->
        <template v-else>
          <div
            v-for="{ msg, originalIndex } in filteredMessages"
            :key="originalIndex"
            class="sv-message"
            :style="`position:relative;margin-bottom:10px;padding:8px 12px;border-radius:8px;font-size:13px;line-height:1.5;max-width:90%;${msg.role === 'user' ? 'margin-left:auto;background:var(--blue);color:#fff;' : 'background:var(--bg-muted);color:var(--text-primary);'}`"
          >
            <!-- Role label + copy button + annotate button row -->
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
              <span style="font-size:10px;font-weight:600;opacity:0.7">
                {{ msg.role.toUpperCase() }}
              </span>
              <div style="display:flex;align-items:center;gap:4px">
                <button
                  class="sv-annotate-btn"
                  :class="{ 'sv-annotate-btn--active': annotationByIndex.has(originalIndex) }"
                  :aria-label="`加註 ${msg.role} 訊息`"
                  style="background:none;border:none;cursor:pointer;padding:0 2px;font-size:14px;line-height:1"
                  @click="promptAnnotate(originalIndex)"
                >📝</button>
                <button
                  class="sv-copy-btn"
                  :aria-label="`複製 ${msg.role} 訊息`"
                  style="background:none;border:none;cursor:pointer;padding:0 2px;font-size:14px;opacity:0.6;line-height:1"
                  @click="copyMessage(msg)"
                >📋</button>
              </div>
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
            <!-- Annotation note block -->
            <div
              v-if="annotationByIndex.has(originalIndex)"
              class="sv-annotation-note"
              :style="`margin-top:6px;padding:5px 8px;border-radius:5px;font-size:12px;line-height:1.4;${msg.role === 'user' ? 'background:#3a3308;color:#fef9c3;' : 'background:#fef9c3;color:#713f12;'}`"
            >
              📝 {{ annotationByIndex.get(originalIndex)?.note }}
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

.sv-annotate-btn {
  opacity: 0.4;
  transition: opacity 0.15s;
}

.sv-annotate-btn:hover,
.sv-annotate-btn--active {
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

/* Story toggle button */
.sv-story-toggle-btn {
  font-size: 13px;
  padding: 4px 12px;
  border-radius: 6px;
  border: 1px solid var(--border-color);
  background: var(--bg-muted);
  color: var(--text-primary);
  cursor: pointer;
  transition: background 0.15s;
}

.sv-story-toggle-btn:hover {
  background: var(--blue, #5a5aeb);
  color: #fff;
  border-color: var(--blue, #5a5aeb);
}

/* Story list */
.story-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 4px 0;
}

.story-step {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.5;
}

.story-icon {
  flex-shrink: 0;
  font-size: 16px;
  line-height: 1.4;
}

.story-text {
  flex: 1;
  word-break: break-word;
}

.story-step--intro {
  background: color-mix(in srgb, var(--blue, #5a5aeb) 12%, transparent);
  color: var(--text-primary);
}

.story-step--thought {
  background: color-mix(in srgb, var(--bg-muted) 80%, transparent);
  color: var(--text-primary);
}

.story-step--action {
  background: color-mix(in srgb, #a855f7 12%, transparent);
  color: var(--text-primary);
}

.story-step--error {
  background: color-mix(in srgb, #ef4444 12%, transparent);
  color: var(--text-primary);
}

.story-step--result {
  background: color-mix(in srgb, #22c55e 12%, transparent);
  color: var(--text-primary);
}
</style>
