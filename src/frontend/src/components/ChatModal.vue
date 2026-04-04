<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue'
import { api } from '@/composables/useApi'
import { showToast } from '@/composables/useToast'
import { getAgentEmoji } from '@/utils/format'

// ---------------------------------------------------------------------------
// Props & emits
// ---------------------------------------------------------------------------

const props = defineProps<{
  agentId: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

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

const messages = ref<ChatMessage[]>([])
const inputText = ref<string>('')
const sending = ref<boolean>(false)
const logRef = ref<HTMLElement | null>(null)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

async function sendMessage(text: string): Promise<void> {
  if (!/^[A-Za-z0-9_-]+$/.test(props.agentId)) {
    messages.value.push({ type: 'error', text: '無效的 Agent ID' })
    return
  }

  sending.value = true
  scrollToBottom()

  try {
    const res = (await api.post('/api/command', {
      command: 'talk',
      agentId: props.agentId,
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

async function send(): Promise<void> {
  const text = inputText.value.trim()
  if (!text || sending.value) return
  messages.value.push({ type: 'user', text })
  inputText.value = ''
  await sendMessage(text)
}

// ---------------------------------------------------------------------------
// Lifecycle — auto-send "hi" on open
// ---------------------------------------------------------------------------

onMounted(async () => {
  messages.value.push({ type: 'system', text: '連線中...' })
  messages.value.push({ type: 'user', text: 'hi' })
  scrollToBottom()
  await sendMessage('hi')
})
</script>

<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div
      class="modal-content"
      style="max-width: 600px; height: 70vh; display: flex; flex-direction: column"
    >
      <!-- Header -->
      <div class="modal-header">
        <span>{{ getAgentEmoji(agentId) }} <strong>{{ agentId }}</strong></span>
        <button class="modal-close" @click="$emit('close')">✕</button>
      </div>

      <!-- Message log -->
      <div ref="logRef" class="chat-log" style="flex: 1; overflow-y: auto; padding: 12px">
        <div v-for="(msg, i) in messages" :key="i" :class="['chat-msg', msg.type]">
          {{ msg.text }}
        </div>

        <!-- Typing indicator -->
        <div v-if="sending" class="chat-msg agent">
          <span style="opacity: 0.5">···</span>
        </div>
      </div>

      <!-- Input area -->
      <div class="chat-input-row" style="padding: 8px; border-top: 1px solid var(--border)">
        <textarea
          v-model="inputText"
          placeholder="輸入訊息..."
          maxlength="2000"
          @keydown="onKeydown"
          @input="autoGrow"
        ></textarea>
        <div
          style="
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-top: 4px;
          "
        >
          <span style="font-size: 11px; color: var(--text-muted)">{{ inputText.length }}/2000</span>
          <button class="ctrl-btn accent" :disabled="sending" @click="send">發送</button>
        </div>
      </div>
    </div>
  </div>
</template>
