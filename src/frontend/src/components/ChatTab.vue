<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
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

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Enter' && e.shiftKey) {
    e.preventDefault()
    send()
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
    <div class="chat-page-header">
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
    <div class="chat-page-input-area">
      <textarea
        ref="inputRef"
        v-model="inputText"
        class="chat-page-input"
        placeholder="輸入訊息..."
        maxlength="2000"
        @keydown="onKeydown"
        @input="autoGrow"
      ></textarea>
      <div class="chat-page-footer">
        <span class="chat-char-count">{{ inputText.length }}/2000</span>
        <button
          class="chat-send"
          :disabled="sending || !inputText.trim()"
          @click="send"
        >
          {{ appState.isMobile ? '↑' : '發送' }}
        </button>
      </div>
    </div>
  </div>
</template>
