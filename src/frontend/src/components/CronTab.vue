<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { api } from '@/composables/useApi'
import { showToast } from '@/composables/useToast'
import { confirm } from '@/composables/useConfirm'
import { fmtTime } from '@/utils/format'
import type { CronJob } from '@/types/api'
import { formatCronError } from '@/lib/cronError'
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts'
import { formatCountdown } from '@/lib/time'
import { buildMarkers, formatRelative } from '@/utils/cronTimeline'
import type { TimelineMarker } from '@/utils/cronTimeline'
import { humanizeCron } from '@/utils/cronHumanizer'

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const jobs = ref<CronJob[]>([])
const loading = ref(false)
const now = ref<number>(Date.now())

let _nowTimer: ReturnType<typeof setInterval> | null = null

const searchInputRef = ref<HTMLInputElement | null>(null)
const searchQuery = ref('')
const filterMode = ref<'all' | 'enabled' | 'disabled'>('all')
const sortBy = ref<'name' | 'nextRun' | 'lastRun'>('name')

// ---------------------------------------------------------------------------
// Computed
// ---------------------------------------------------------------------------

const filteredJobs = computed<CronJob[]>(() => {
  const query = searchQuery.value.trim().toLowerCase()

  // 1. Search by name OR schedule.expr (case-insensitive substring)
  let result = query
    ? jobs.value.filter((j) => {
        const nameMatch = j.name.toLowerCase().includes(query)
        const exprMatch = (j.schedule?.expr ?? '').toLowerCase().includes(query)
        return nameMatch || exprMatch
      })
    : [...jobs.value]

  // 2. Filter by enabled/disabled
  if (filterMode.value === 'enabled') {
    result = result.filter((j) => j.enabled)
  } else if (filterMode.value === 'disabled') {
    result = result.filter((j) => !j.enabled)
  }

  // 3. Sort
  result = [...result].sort((a, b) => {
    if (sortBy.value === 'name') {
      return a.name.localeCompare(b.name)
    }
    if (sortBy.value === 'nextRun') {
      const aMs = a.state?.nextRunAtMs ?? Infinity
      const bMs = b.state?.nextRunAtMs ?? Infinity
      return aMs - bMs
    }
    if (sortBy.value === 'lastRun') {
      const aMs = a.state?.lastRunAtMs ?? -1
      const bMs = b.state?.lastRunAtMs ?? -1
      // desc: most recent first; unexecuted (-1) placed last
      if (aMs === -1 && bMs === -1) return 0
      if (aMs === -1) return 1
      if (bMs === -1) return -1
      return bMs - aMs
    }
    return 0
  })

  return result
})

const hasJobs = computed(() => jobs.value.length > 0)
const hasResults = computed(() => filteredJobs.value.length > 0)
const isFiltered = computed(
  () => searchQuery.value.trim() !== '' || filterMode.value !== 'all',
)

// Up Next timeline: map CronJob state.nextRunAtMs → TimelineJob.nextRun
const markers = computed<TimelineMarker[]>(() => {
  const timelineJobs = jobs.value.map((j) => ({
    id: j.id,
    name: j.name,
    enabled: j.enabled,
    nextRun: j.state?.nextRunAtMs,
  }))
  return buildMarkers(timelineJobs, now.value)
})

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

const { registerShortcut } = useKeyboardShortcuts()

onMounted(() => {
  fetchJobs()
  _nowTimer = setInterval(() => {
    now.value = Date.now()
  }, 1000)
  registerShortcut({
    key: '/',
    handler: () => {
      searchInputRef.value?.focus()
      searchInputRef.value?.select()
    },
    description: '聚焦搜尋',
    category: 'Actions',
  })
})

onUnmounted(() => {
  if (_nowTimer !== null) {
    clearInterval(_nowTimer)
    _nowTimer = null
  }
})

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
    showToast('❌ 獲取 Cron 任務失敗: ' + (e as Error).message, 'error')
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
    // Revert local state immediately, then try re-fetch for full sync
    const job = jobs.value.find((j) => j.id === id)
    if (job) job.enabled = !enabled
    await fetchJobs().catch(() => {})
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

async function runJob(id: string, name?: string): Promise<void> {
  showToast('正在執行任務...', 'info')
  try {
    const data = (await api.post(`/api/cron/jobs/${id}/run`)) as {
      success: boolean
      message?: string
      error?: string
    }
    if (data.success) {
      const label = name ? `已觸發: ${name}` : (data.message ?? '任務已觸發（在背景執行中）')
      showToast(label, 'success')
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

function getNextRunCountdown(job: CronJob): string {
  if (!job.enabled) return '已停用'
  return formatCountdown(job.state?.nextRunAtMs ?? 0, now.value)
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

    <!-- Empty state: no jobs at all -->
    <div v-else-if="!hasJobs" class="empty-state">
      <div class="empty-state-icon">
        <span class="empty-icon-inner">⏰</span>
      </div>
      <div class="empty-state-title">沒有 Cron 任務</div>
      <div class="empty-state-desc">目前沒有已排程的定時任務</div>
    </div>

    <!-- Jobs exist: show filter bar + grid -->
    <template v-else>
      <!-- Up Next timeline card -->
      <div class="cron-timeline-card">
        <div class="cron-timeline-header">
          <span class="cron-timeline-title">⏰ Up Next (24h)</span>
          <span class="cron-timeline-badge">{{ markers.length }}</span>
        </div>

        <!-- Empty state: no jobs fire within 24h -->
        <div v-if="markers.length === 0" class="cron-timeline-empty">
          未來 24 小時無 cron 觸發
        </div>

        <!-- SVG axis -->
        <svg
          v-else
          class="cron-timeline-svg"
          viewBox="0 0 720 80"
          aria-label="Cron Up Next 24h 時間軸"
          role="img"
        >
          <!-- axis line -->
          <line x1="20" y1="50" x2="700" y2="50" stroke="var(--border, rgba(255,255,255,0.18))" stroke-width="1.5" />

          <!-- hour tick labels: 0 / 6 / 12 / 18 / 24 -->
          <text v-for="tick in [0, 6, 12, 18, 24]" :key="tick"
            :x="20 + (680 * tick / 24)"
            y="68"
            font-size="10"
            fill="var(--text-muted, #94a3b8)"
            text-anchor="middle"
          >{{ tick }}h</text>

          <!-- tick marks -->
          <line v-for="tick in [0, 6, 12, 18, 24]" :key="'t' + tick"
            :x1="20 + (680 * tick / 24)"
            :x2="20 + (680 * tick / 24)"
            y1="46"
            y2="54"
            stroke="var(--border, rgba(255,255,255,0.18))"
            stroke-width="1"
          />

          <!-- job markers -->
          <g v-for="m in markers" :key="m.id">
            <title>{{ m.name }} — {{ formatRelative(m.ts - now) }}</title>
            <circle
              :cx="20 + (680 * m.hourOffset / 24)"
              cy="50"
              r="6"
              :fill="m.isOverdue ? 'var(--red, #ef4444)' : 'var(--accent, #6366f1)'"
              opacity="0.92"
            />
          </g>
        </svg>
      </div>

      <!-- Filter bar -->
      <div class="cron-filter-bar">
        <input
          ref="searchInputRef"
          v-model="searchQuery"
          class="cron-search-input"
          placeholder="搜尋名稱或 schedule"
          type="search"
        />

        <div class="cron-filter-buttons" role="group" aria-label="啟用狀態篩選">
          <button
            :class="['cron-filter-btn', { active: filterMode === 'all' }]"
            @click="filterMode = 'all'"
          >
            全部
          </button>
          <button
            :class="['cron-filter-btn', { active: filterMode === 'enabled' }]"
            @click="filterMode = 'enabled'"
          >
            已啟用
          </button>
          <button
            :class="['cron-filter-btn', { active: filterMode === 'disabled' }]"
            @click="filterMode = 'disabled'"
          >
            已停用
          </button>
        </div>

        <select v-model="sortBy" class="cron-sort-select" aria-label="排序方式">
          <option value="name">名稱</option>
          <option value="nextRun">下次執行</option>
          <option value="lastRun">上次執行</option>
        </select>
      </div>

      <!-- Empty state: jobs exist but none match filters -->
      <div v-if="!hasResults" class="empty-state">
        <div class="empty-state-icon">
          <span class="empty-icon-inner">🔍</span>
        </div>
        <div class="empty-state-title">沒有符合條件</div>
        <div class="empty-state-desc">
          {{ isFiltered ? '請嘗試調整搜尋或篩選條件' : '目前沒有已排程的定時任務' }}
        </div>
      </div>

      <!-- Cron job grid -->
      <div v-else class="cron-grid">
        <div
          v-for="job in filteredJobs"
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
                <div class="agent-hostname">
                  {{ job.schedule?.expr ?? 'Once' }}
                  <small v-if="job.schedule?.expr" class="cron-human">· {{ humanizeCron(job.schedule.expr) }}</small>
                </div>
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
                @click="runJob(job.id, job.name)"
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

            <!-- lastError inline display (only when status is error AND lastError exists) -->
            <div
              v-if="job.state?.lastStatus === 'error' && job.state?.lastError"
              class="cron-error-inline"
              :title="formatCronError(job.state.lastError, 300)"
            >
              {{ formatCronError(job.state.lastError) }}
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
                <span class="cron-countdown">{{ getNextRunCountdown(job) }}</span>
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
    </template>
  </div>
</template>

<style scoped>
.cron-filter-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 0 14px;
  flex-wrap: wrap;
}

.cron-search-input {
  flex: 1;
  min-width: 160px;
  padding: 6px 10px;
  border: 1px solid var(--border, rgba(255, 255, 255, 0.12));
  border-radius: 6px;
  background: var(--surface2, rgba(255, 255, 255, 0.05));
  color: var(--text, #e2e8f0);
  font-size: 13px;
  outline: none;
  transition: border-color 0.15s;
}

.cron-search-input:focus {
  border-color: var(--accent, #6366f1);
}

.cron-filter-buttons {
  display: flex;
  gap: 4px;
}

.cron-filter-btn {
  padding: 5px 10px;
  font-size: 12px;
  border: 1px solid var(--border, rgba(255, 255, 255, 0.12));
  border-radius: 5px;
  background: transparent;
  color: var(--text-muted, #94a3b8);
  cursor: pointer;
  transition:
    background 0.15s,
    color 0.15s,
    border-color 0.15s;
}

.cron-filter-btn:hover {
  background: var(--surface2, rgba(255, 255, 255, 0.07));
  color: var(--text, #e2e8f0);
}

.cron-filter-btn.active {
  background: var(--accent, #6366f1);
  border-color: var(--accent, #6366f1);
  color: #fff;
}

.cron-sort-select {
  padding: 5px 8px;
  font-size: 12px;
  border: 1px solid var(--border, rgba(255, 255, 255, 0.12));
  border-radius: 5px;
  background: var(--surface2, rgba(255, 255, 255, 0.05));
  color: var(--text, #e2e8f0);
  cursor: pointer;
  outline: none;
}

.cron-sort-select:focus {
  border-color: var(--accent, #6366f1);
}

.cron-countdown {
  display: block;
  font-size: 10px;
  color: var(--text-muted, #94a3b8);
  margin-top: 2px;
  font-variant-numeric: tabular-nums;
}

/* ── Up Next timeline card ──────────────────────────────────────── */

.cron-timeline-card {
  background: var(--surface2, rgba(255, 255, 255, 0.05));
  border: 1px solid var(--border, rgba(255, 255, 255, 0.12));
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 14px;
}

.cron-timeline-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.cron-timeline-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text, #e2e8f0);
}

.cron-timeline-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  background: var(--accent, #6366f1);
  color: #fff;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
}

.cron-timeline-empty {
  font-size: 12px;
  color: var(--text-muted, #94a3b8);
  padding: 8px 0 4px;
  text-align: center;
}

.cron-timeline-svg {
  width: 100%;
  height: auto;
  display: block;
  overflow: visible;
}

.cron-human {
  color: var(--text-muted, #94a3b8);
  font-size: 0.85em;
  font-weight: 400;
}
</style>
