<script setup lang="ts">
import { ref } from 'vue'
import MonitorTab from '@/components/MonitorTab.vue'
import AgentDetail from '@/components/AgentDetail.vue'
import { appState } from '@/stores/appState'

const detailAgentId = ref('')

function showAgentDetail(agentId: string) {
  detailAgentId.value = agentId
  appState.currentDesktopTab = 'detail'
}

function closeDetail() {
  detailAgentId.value = ''
  appState.currentDesktopTab = 'monitor'
}

function openChat(agentId: string) {
  // TODO: Phase 3 — open chat modal
  console.log('Open chat:', agentId)
}

function openModelSwitch(agentId: string, model: string) {
  // TODO: Phase 3 — open model switch modal
  console.log('Model switch:', agentId, model)
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

      <!-- System Tab Placeholder -->
      <div v-show="appState.currentDesktopTab === 'system'" class="dtab-page">
        <div class="section-header"><h2>📊 系統資源</h2></div>
        <p style="color:var(--text-muted);padding:20px">Phase 3 遷移中...</p>
      </div>

      <!-- Logs Tab Placeholder -->
      <div v-show="appState.currentDesktopTab === 'logs'" class="dtab-page">
        <div class="section-header"><h2>⚙️ 日誌</h2></div>
        <p style="color:var(--text-muted);padding:20px">Phase 3 遷移中...</p>
      </div>

      <!-- Chat Tab Placeholder -->
      <div v-show="appState.currentDesktopTab === 'chat'" class="dtab-page chat-tab-page">
        <div class="section-header"><h2>💬 聊天室</h2></div>
        <p style="color:var(--text-muted);padding:20px">Phase 3 遷移中...</p>
      </div>
    </main>
  </div>
</template>
