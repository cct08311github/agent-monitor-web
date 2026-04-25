<script setup lang="ts">
import { ref, watch } from 'vue'
import MonitorTab from '@/components/MonitorTab.vue'
import AgentDetail from '@/components/AgentDetail.vue'
import SystemTab from '@/components/SystemTab.vue'
import LogsTab from '@/components/LogsTab.vue'
import ChatTab from '@/components/ChatTab.vue'
import OptimizeTab from '@/components/OptimizeTab.vue'
import ChatModal from '@/components/ChatModal.vue'
import ModelSwitchModal from '@/components/ModelSwitchModal.vue'
import HelpModal from '@/components/HelpModal.vue'
import CommandPalette from '@/components/CommandPalette.vue'
import { appState } from '@/stores/appState'
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts'

const detailAgentId = ref('')

// Chat modal state
const chatModalAgentId = ref('')
const showChatModal = ref(false)

// Model switch modal state
const modelSwitchAgentId = ref('')
const modelSwitchCurrentModel = ref('')
const showModelModal = ref(false)

// Help modal state
const showHelpModal = ref(false)

// Command Palette state
const showPalette = ref(false)

// External trigger: any component can increment appState.commandPaletteRequest
// to open the palette (e.g. the header button in App.vue)
watch(
  () => appState.commandPaletteRequest,
  (newVal, oldVal) => {
    if (newVal !== oldVal) {
      showPalette.value = true
    }
  },
)

// ---------------------------------------------------------------------------
// Keyboard shortcuts
// ---------------------------------------------------------------------------

const { registerShortcut } = useKeyboardShortcuts()

const TAB_SHORTCUTS: Array<[string, string, string]> = [
  ['1', 'monitor', '切到 Monitor'],
  ['2', 'system', '切到 System'],
  ['3', 'logs', '切到 Logs'],
  ['4', 'chat', '切到 Chat'],
  ['5', 'optimize', '切到 Optimize'],
]

for (const [key, tab, description] of TAB_SHORTCUTS) {
  registerShortcut({
    key,
    handler: () => {
      appState.currentDesktopTab = tab
    },
    description,
    category: 'Navigation',
  })
}

// '?' on a US keyboard is Shift+/, event.key === '?' and event.shiftKey === true
// useKeyboardShortcuts matches !!shortcut.shift === event.shiftKey, so shift: true is required
registerShortcut({
  key: '?',
  shift: true,
  handler: () => {
    showHelpModal.value = true
  },
  description: '顯示快捷鍵清單',
  category: 'Actions',
})

// Command Palette — Cmd+K (macOS) and Ctrl+K (Windows/Linux)
registerShortcut({
  key: 'k',
  meta: true,
  handler: () => {
    showPalette.value = true
  },
  description: '開啟命令面板',
  category: 'Actions',
})

registerShortcut({
  key: 'k',
  ctrl: true,
  handler: () => {
    showPalette.value = true
  },
  description: '開啟命令面板',
  category: 'Actions',
})

function showAgentDetail(agentId: string) {
  detailAgentId.value = agentId
  appState.currentDesktopTab = 'detail'
}

function closeDetail() {
  detailAgentId.value = ''
  appState.currentDesktopTab = 'monitor'
}

function openChat(agentId: string) {
  chatModalAgentId.value = agentId
  showChatModal.value = true
}

function openModelSwitch(agentId: string, model: string) {
  modelSwitchAgentId.value = agentId
  modelSwitchCurrentModel.value = model
  showModelModal.value = true
}
</script>

<template>
  <div>
    <!-- Help button (floating top-right) -->
    <button
      class="help-trigger-btn"
      title="快捷鍵清單 (?)"
      aria-label="顯示快捷鍵清單"
      @click="showHelpModal = true"
    >
      ❓
    </button>

    <!-- Main Content -->
    <main class="main-content">
      <!-- Monitor Tab (manages its own SSE + data) -->
      <MonitorTab
        v-show="appState.currentDesktopTab === 'monitor'"
        @agent-click="showAgentDetail"
        @agent-chat="openChat"
        @agent-model-switch="openModelSwitch"
      />

      <!-- Agent Detail -->
      <AgentDetail
        v-if="appState.currentDesktopTab === 'detail' && detailAgentId"
        :key="detailAgentId"
        :agentId="detailAgentId"
        @close="closeDetail"
        @chat="openChat"
        @model-switch="openModelSwitch"
      />

      <!-- System Tab -->
      <SystemTab v-if="appState.currentDesktopTab === 'system'" />

      <!-- Logs Tab -->
      <LogsTab v-if="appState.currentDesktopTab === 'logs'" />

      <!-- Chat Tab -->
      <ChatTab v-if="appState.currentDesktopTab === 'chat'" />

      <!-- Optimize Tab -->
      <OptimizeTab v-if="appState.currentDesktopTab === 'optimize'" />
    </main>

    <!-- Chat Modal (from agent card actions) -->
    <ChatModal
      v-if="showChatModal"
      :agentId="chatModalAgentId"
      @close="showChatModal = false"
    />

    <!-- Model Switch Modal -->
    <ModelSwitchModal
      v-if="showModelModal"
      :agentId="modelSwitchAgentId"
      :currentModel="modelSwitchCurrentModel"
      @close="showModelModal = false"
      @switched="showModelModal = false"
    />

    <!-- Help Modal -->
    <HelpModal :open="showHelpModal" @close="showHelpModal = false" />

    <!-- Command Palette -->
    <CommandPalette
      :open="showPalette"
      @close="showPalette = false"
      @open-help="showHelpModal = true"
    />
  </div>
</template>

<style scoped>
.help-trigger-btn {
  position: fixed;
  top: 0.75rem;
  right: 1rem;
  z-index: 900;
  background: none;
  border: none;
  font-size: 1.1rem;
  line-height: 1;
  cursor: pointer;
  padding: 0.3rem 0.4rem;
  border-radius: 0.375rem;
  opacity: 0.6;
  transition: opacity 0.15s;
}

.help-trigger-btn:hover {
  opacity: 1;
}
</style>
