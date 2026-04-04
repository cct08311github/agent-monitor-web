<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api } from '@/composables/useApi'
import { showToast } from '@/composables/useToast'
import { confirm } from '@/composables/useConfirm'
import { fmtTime } from '@/utils/format'
import type { CronJob } from '@/types/api'

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const jobs = ref<CronJob[]>([])
const loading = ref(false)

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

onMounted(() => fetchJobs())

// ---------------------------------------------------------------------------
// API operations
// ---------------------------------------------------------------------------

async function fetchJobs(): Promise<void> {
  if (loading.value) return
  loading.value = true
  try {
    const data = (await api.get('/api/cron/jobs')) as { success: boolean; jobs: CronJob[] }
    if (data.success) {
      jobs.value = data.jobs
    }
  } catch (e) {
    console.error('獲取 Cron 任務失敗:', (e as Error).message)
  } finally {
    loading.value = false
  }
}

async function toggleJob(id: string, enabled: boolean): Promise<void> {
  showToast(enabled ? '正在啟用任務...' : '正在停用任務...', 'info')
  try {
    const data = (await api.post(`/api/cron/jobs/${id}/toggle`, { enabled })) as {
      success: boolean
      error?: string
    }
    if (data.success) {
      showToast(enabled ? '✅ 任務已啟用' : '✅ 任務已停用', 'success')
      const job = jobs.value.find((j) => j.id === id)
      if (job) job.enabled = enabled
    } else {
      throw new Error(data.error ?? 'Toggle failed')
    }
  } catch (e) {
    showToast('❌ 操作失敗: ' + (e as Error).message, 'error')
    // Revert by re-fetching
    await fetchJobs()
  }
}

async function deleteJob(id: string, name: string): Promise<void> {
  const ok = await confirm({ type: 'danger', title: '刪除 Cron 任務', message: `確認刪除 Cron 任務「${name}」？\n此操作無法復原。`, confirmLabel: '刪除' })
  if (!ok) return
  showToast('刪除中...', 'info')
  try {
    const data = (await api.del(`/api/cron/jobs/${id}`)) as {
      success: boolean
      error?: string
    }
    if (!data.success) throw new Error(data.error ?? '刪除失敗')
    showToast('✅ 任務已刪除', 'success')
    jobs.value = jobs.value.filter((j) => j.id !== id)
  } catch (e) {
    showToast('❌ 刪除失敗: ' + (e as Error).message, 'error')
  }
}

async function runJob(id: string): Promise<void> {
  showToast('正在執行任務...', 'info')
  try {
    const data = (await api.post(`/api/cron/jobs/${id}/run`)) as {
      success: boolean
      message?: string
      error?: string
    }
    if (data.success) {
      showToast('✅ ' + (data.message ?? '任務已觸發（在背景執行中）'), 'success')
      await fetchJobs()
    } else {
      throw new Error(data.error ?? '執行失敗')
    }
  } catch (e) {
    showToast('❌ 執行失敗: ' + (e as Error).message, 'error')
    await fetchJobs()
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getStatusClass(status: string | undefined): string {
  if (status === 'ok') return 'online'
  if (status === 'error') return 'offline'
  return 'idle'
}

function getStatusText(status: string | undefined): string {
  if (status === 'ok') return '成功'
  if (status === 'error') return '失敗'
  return '未知'
}

function formatLastRun(ms: number | undefined): string {
  return ms ? fmtTime(new Date(ms)) : '尚未執行'
}

function formatNextRun(ms: number | undefined): string {
  return ms ? fmtTime(new Date(ms)) : '未排程'
}
</script>

<template>
  <div>
    <!-- Loading indicator -->
    <div v-if="loading" class="empty-state">
      <div class="empty-state-icon">
        <span class="empty-icon-inner">⏰</span>
      </div>
      <div class="empty-state-title">載入中...</div>
    </div>

    <!-- Empty state -->
    <div v-else-if="jobs.length === 0" class="empty-state">
      <div class="empty-state-icon">
        <span class="empty-icon-inner">⏰</span>
      </div>
      <div class="empty-state-title">沒有 Cron 任務</div>
      <div class="empty-state-desc">目前沒有已排程的定時任務</div>
    </div>

    <!-- Cron job grid -->
    <div v-else class="cron-grid">
      <div
        v-for="job in jobs"
        :key="job.id"
        :class="['agent-card', { dormant: !job.enabled }]"
        style="cursor: default"
      >
        <!-- Card header -->
        <div class="agent-card-header">
          <!-- Name block -->
          <div class="agent-card-name">
            <div class="agent-avatar">⏰</div>
            <div>
              <div class="agent-name">{{ job.name }}</div>
              <div class="agent-hostname">{{ job.schedule?.expr ?? 'Once' }}</div>
            </div>
          </div>

          <!-- Controls -->
          <div style="display: flex; align-items: center; gap: 8px">
            <!-- Run button -->
            <button
              class="cron-run-button"
              title="立即執行"
              style="
                background: var(--green);
                color: white;
                border: none;
                border-radius: 4px;
                padding: 4px 8px;
                font-size: 12px;
                cursor: pointer;
              "
              @click="runJob(job.id)"
            >
              ▶️ 執行
            </button>

            <!-- Delete button -->
            <button
              title="刪除任務"
              style="
                background: rgba(239, 68, 68, 0.15);
                color: #ef4444;
                border: none;
                border-radius: 4px;
                padding: 4px 8px;
                font-size: 12px;
                cursor: pointer;
              "
              @click="deleteJob(job.id, job.name)"
            >
              🗑
            </button>

            <!-- Enable/disable toggle -->
            <label class="watchdog-toggle">
              <input
                type="checkbox"
                :checked="job.enabled"
                @change="toggleJob(job.id, ($event.target as HTMLInputElement).checked)"
              />
              <span class="toggle-slider" />
            </label>
          </div>
        </div>

        <!-- Card body -->
        <div class="agent-card-body">
          <!-- Status row -->
          <div class="agent-info-row">
            <span class="agent-info-label">最後狀態</span>
            <span :class="['agent-status', getStatusClass(job.state?.lastStatus)]">
              <span class="agent-status-dot" />
              {{ getStatusText(job.state?.lastStatus) }}
            </span>
          </div>

          <!-- Last run row -->
          <div class="agent-info-row">
            <span class="agent-info-label">上次執行</span>
            <span class="agent-info-value" style="font-size: 11px">
              {{ formatLastRun(job.state?.lastRunAtMs) }}
            </span>
          </div>

          <!-- Next run row -->
          <div class="agent-info-row">
            <span class="agent-info-label">下次執行</span>
            <span class="agent-info-value" style="font-size: 11px">
              {{ formatNextRun(job.state?.nextRunAtMs) }}
            </span>
          </div>

          <!-- Agent ID row -->
          <div class="agent-info-row">
            <span class="agent-info-label">Agent ID</span>
            <span class="agent-info-value">{{ job.agentId ?? 'N/A' }}</span>
          </div>
        </div>

        <!-- Description preview -->
        <div class="agent-task-preview" style="margin-top: 8px">
          <div
            class="agent-task-content"
            style="white-space: pre-wrap; word-break: break-word; max-height: 60px; overflow-y: auto"
          >
            {{ job.description ?? '無描述' }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
