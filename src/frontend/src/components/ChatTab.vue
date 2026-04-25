<script setup lang="ts">
import { ref, computed, nextTick, onMounted } from 'vue'
import { api } from '@/composables/useApi'
import { showToast } from '@/composables/useToast'
import { getAgentEmoji } from '@/utils/format'
import { appState } from '@/stores/appState'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatMessage {
  type: 'user' | 'agent' | 'error' | 'system'
  text: string
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HISTORY_MAX = 50
const STORAGE_KEY = 'oc_chat_input_history'

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const agentIds = computed<string[]>(() => {
  const ids = new Set<string>(['main'])
  if (appState.latestDashboard) {
    for (const a of appState.latestDashboard.agents) {
      ids.add(a.id)
    }
  }
  return Array.from(ids)
})

const selectedAgent = ref<string>('main')
const messages = ref<ChatMessage[]>([])
const inputText = ref<string>('')
const sending = ref<boolean>(false)

const logRef = ref<HTMLElement | null>(null)
const inputRef = ref<HTMLTextAreaElement | null>(null)

// Input history state
const history = ref<string[]>([])          // newest at end
const historyIndex = ref<number>(-1)       // -1 = current (unsent) input
const unsavedDraft = ref<string>('')       // draft before first ↑

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

onMounted(() => {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as unknown
    if (Array.isArray(stored)) {
      history.value = (stored as unknown[])
        .filter((v): v is string => typeof v === 'string')
        .slice(-HISTORY_MAX)
    }
  } catch {
    // silent fallback
    history.value = []
  }
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function selectAgent(id: string): void {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return
  selectedAgent.value = id
  messages.value = []
}

function scrollToBottom(): void {
  nextTick(() => {
    if (logRef.value) {
      logRef.value.scrollTop = logRef.value.scrollHeight
    }
  })
}

function autoGrow(e: Event): void {
  const el = e.target as HTMLTextAreaElement
  el.style.height = 'auto'
  el.style.height = el.scrollHeight + 'px'
}

function pushHistory(text: string): void {
  const trimmed = text.trim()
  if (!trimmed) return
  // Dedupe: skip if identical to last entry
  if (history.value.length > 0 && history.value[history.value.length - 1] === trimmed) return
  history.value = [...history.value, trimmed].slice(-HISTORY_MAX)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history.value))
  } catch {
    // silent fallback
  }
}

function onKeydown(e: KeyboardEvent): void {
  // Existing: Shift+Enter → send (do not touch)
  if (e.key === 'Enter' && e.shiftKey) {
    e.preventDefault()
    send()
    return
  }

  // ArrowUp: recall older history.
  // Trigger condition: already in history-browsing mode (historyIndex >= 0),
  // OR caret is at position 0, OR input is empty.
  // This prevents accidental triggering mid-line in multi-line text while still
  // allowing continued navigation once browsing has started.
  if (e.key === 'ArrowUp') {
    const el = inputRef.value
    const caretAtStart = el ? el.selectionStart === 0 : true
    const inputEmpty = inputText.value.trim() === ''
    const alreadyBrowsing = historyIndex.value >= 0
    if (alreadyBrowsing || caretAtStart || inputEmpty) {
      if (history.value.length === 0) return
      e.preventDefault()
      // Save draft on first ↑
      if (historyIndex.value === -1) {
        unsavedDraft.value = inputText.value
      }
      if (historyIndex.value < history.value.length - 1) {
        historyIndex.value++
      }
      inputText.value = history.value[history.value.length - 1 - historyIndex.value]
    }
    return
  }

  // ArrowDown: recall newer history / restore draft
  if (e.key === 'ArrowDown' && historyIndex.value >= 0) {
    e.preventDefault()
    historyIndex.value--
    if (historyIndex.value < 0) {
      inputText.value = unsavedDraft.value
    } else {
      inputText.value = history.value[history.value.length - 1 - historyIndex.value]
    }
    return
  }

  // Escape: cancel history browsing, restore draft
  if (e.key === 'Escape' && historyIndex.value >= 0) {
    e.preventDefault()
    inputText.value = unsavedDraft.value
    historyIndex.value = -1
  }
}

// ---------------------------------------------------------------------------
// Send
// ---------------------------------------------------------------------------

async function send(): Promise<void> {
  const text = inputText.value.trim()
  if (!text || sending.value) return

  const agentId = selectedAgent.value
  if (!/^[A-Za-z0-9_-]+$/.test(agentId)) {
    messages.value.push({ type: 'error', text: '無效的 Agent ID' })
    return
  }

  // Push to history before clearing
  pushHistory(text)
  historyIndex.value = -1

  messages.value.push({ type: 'user', text })
  inputText.value = ''
  sending.value = true
  scrollToBottom()

  // Reset textarea height
  if (inputRef.value) {
    inputRef.value.style.height = 'auto'
  }

  try {
    const res = (await api.post('/api/command', {
      command: 'talk',
      agentId,
      message: text,
    })) as { output?: string; message?: string }

    const reply = res?.output ?? res?.message ?? '（無回應）'
    messages.value.push({ type: 'agent', text: reply })
  } catch (err) {
    const msg = err instanceof Error ? err.message : '送出失敗'
    messages.value.push({ type: 'error', text: `錯誤：${msg}` })
    showToast('❌ ' + msg, 'error')
  } finally {
    sending.value = false
    scrollToBottom()
  }
}
</script>

<template>
  <div class="chat-tab-page">
    <div class="section-header">
      <h2>💬 聊天室</h2>
    </div>

    <!-- Agent selector pills -->
    <div class="chat-agent-pills">
      <button
        v-for="id in agentIds"
        :key="id"
        :class="['chat-agent-pill', { active: selectedAgent === id }]"
        @click="selectAgent(id)"
      >
        {{ getAgentEmoji(id) }} {{ id }}
      </button>
    </div>

    <!-- Message log -->
    <div ref="logRef" class="chat-page-log">
      <!-- Empty state -->
      <div v-if="messages.length === 0" class="chat-page-empty">
        <div class="chat-page-empty-icon">💬</div>
        <div class="chat-page-empty-text">
          與 <strong>{{ selectedAgent }}</strong> 開始對話<br />
          <span style="font-size: 12px; opacity: 0.6">輸入訊息後按 Shift+Enter 送出</span>
        </div>
      </div>

      <!-- Messages -->
      <div v-for="(msg, i) in messages" :key="i" :class="['chat-msg', msg.type]">
        {{ msg.text }}
      </div>

      <!-- Typing indicator -->
      <div v-if="sending" class="chat-msg agent">
        <span style="opacity: 0.5">···</span>
      </div>
    </div>

    <!-- Input area -->
    <div class="chat-page-input-row">
      <textarea
        ref="inputRef"
        v-model="inputText"
        class="chat-page-textarea"
        placeholder="輸入訊息..."
        maxlength="2000"
        @keydown="onKeydown"
        @input="autoGrow"
      ></textarea>
      <button
        class="chat-page-send ctrl-btn accent"
        :disabled="sending || !inputText.trim()"
        @click="send"
      >
        {{ appState.isMobile ? '↑' : '發送' }}
      </button>
    </div>
    <div :class="['chat-char-counter', { warn: inputText.length > 1800 }]">
      {{ inputText.length }} / 2000
    </div>
  </div>
</template>
