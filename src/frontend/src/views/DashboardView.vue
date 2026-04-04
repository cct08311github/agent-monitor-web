<script setup lang="ts">
import { ref } from 'vue'
import MonitorTab from '@/components/MonitorTab.vue'
import AgentDetail from '@/components/AgentDetail.vue'
import SystemTab from '@/components/SystemTab.vue'
import LogsTab from '@/components/LogsTab.vue'
import ChatTab from '@/components/ChatTab.vue'
import ChatModal from '@/components/ChatModal.vue'
import ModelSwitchModal from '@/components/ModelSwitchModal.vue'
import { appState } from '@/stores/appState'

const detailAgentId = ref('')

// Chat modal state
const chatModalAgentId = ref('')
const showChatModal = ref(false)

// Model switch modal state
const modelSwitchAgentId = ref('')
const modelSwitchCurrentModel = ref('')
const showModelModal = ref(false)

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
        :agentId="detailAgentId"
        @close="closeDetail"
        @chat="openChat"
        @model-switch="openModelSwitch"
      />

      <!-- System Tab -->
      <SystemTab v-show="appState.currentDesktopTab === 'system'" />

      <!-- Logs Tab -->
      <LogsTab v-show="appState.currentDesktopTab === 'logs'" />

      <!-- Chat Tab -->
      <ChatTab v-show="appState.currentDesktopTab === 'chat'" />
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
  </div>
</template>
