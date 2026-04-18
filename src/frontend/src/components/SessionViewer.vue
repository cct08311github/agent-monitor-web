<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { api } from '@/composables/useApi'
import { createFocusTrap } from '@/lib/focusTrap'

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

const messages = ref<SessionMessage[]>([])
const loading = ref(true)
const error = ref(false)

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
  if (text.length <= 2000) return text
  return text.slice(0, 2000) + '\n…（已截斷）'
}
</script>

<template>
  <div class="modal-overlay" style="display:flex" @click="handleOverlayClick">
    <div ref="dialogRef" class="modal-content" role="dialog" aria-modal="true" style="max-width:700px;width:95%;max-height:80vh;display:flex;flex-direction:column">
      <!-- Header -->
      <div class="modal-header" style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--border-color);flex-shrink:0">
        <h3 style="margin:0;font-size:14px;font-weight:600">💬 {{ sessionId.slice(-12) }}</h3>
        <button class="modal-close ctrl-btn" @click="$emit('close')" aria-label="關閉">✕</button>
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

        <!-- Empty -->
        <div v-else-if="messages.length === 0" style="color:var(--text-muted);text-align:center;padding:24px">無訊息記錄</div>

        <!-- Messages -->
        <template v-else>
          <div
            v-for="(msg, i) in messages"
            :key="i"
            :style="`margin-bottom:10px;padding:8px 12px;border-radius:8px;font-size:13px;line-height:1.5;max-width:90%;${msg.role === 'user' ? 'margin-left:auto;background:var(--blue);color:#fff;' : 'background:var(--bg-muted);color:var(--text-primary);'}`"
          >
            <!-- Role label -->
            <div style="font-size:10px;font-weight:600;margin-bottom:4px;opacity:0.7">
              {{ msg.role.toUpperCase() }}
            </div>
            <!-- Text content -->
            <div v-if="msg.text" style="white-space:pre-wrap;word-break:break-word">
              {{ truncateText(msg.text) }}
            </div>
            <!-- Tool uses -->
            <div v-if="msg.toolUses && msg.toolUses.length > 0" style="margin-top:4px;font-size:11px;opacity:0.75;font-family:monospace">
              🔧 {{ msg.toolUses.join(', ') }}
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
