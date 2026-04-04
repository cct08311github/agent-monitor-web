<script setup lang="ts">
import type { DashboardPayload } from '@/types/api'
import type { CostRange } from '@/composables/useDashboard'
import { formatTWD } from '@/utils/format'
import { appState } from '@/stores/appState'

defineProps<{
  activeTab: string
  dashboard: DashboardPayload | null
  totalCost: number
  costRange: CostRange
}>()

defineEmits<{
  (e: 'update:costRange', value: CostRange): void
}>()
</script>

<template>
  <div class="summary-cards">
    <!-- Active agents -->
    <div class="summary-card">
      <div class="summary-card-label">活躍 Agent</div>
      <div class="summary-card-value">
        {{ dashboard?.agents?.filter(a => a.status === 'active_executing' || a.status === 'active_recent').length ?? 0 }}
        <span class="summary-card-sub">/ {{ dashboard?.agents?.length ?? 0 }}</span>
      </div>
    </div>

    <!-- Total cost -->
    <div class="summary-card">
      <div class="summary-card-label">
        費用
        <select
          :value="costRange"
          class="cost-range-select"
          style="font-size:11px;margin-left:4px;background:transparent;border:none;color:inherit;cursor:pointer"
          @change="$emit('update:costRange', ($event.target as HTMLSelectElement).value as CostRange)"
        >
          <option value="today">今日</option>
          <option value="week">本週</option>
          <option value="month">本月</option>
          <option value="all">全部</option>
        </select>
      </div>
      <div class="summary-card-value" style="color:var(--green)">
        {{ formatTWD(totalCost, appState.currentExchangeRate) }}
      </div>
    </div>

    <!-- Cron jobs -->
    <div class="summary-card">
      <div class="summary-card-label">Cron 任務</div>
      <div class="summary-card-value">
        {{ dashboard?.cron?.filter(c => c.enabled).length ?? 0 }}
        <span class="summary-card-sub">啟用</span>
      </div>
    </div>

    <!-- System CPU -->
    <div class="summary-card">
      <div class="summary-card-label">CPU</div>
      <div class="summary-card-value">
        {{ dashboard?.sys?.cpu != null ? dashboard.sys.cpu.toFixed(0) + '%' : '-' }}
      </div>
    </div>
  </div>
</template>
