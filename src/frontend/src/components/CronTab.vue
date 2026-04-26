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
import { computeCronStats } from '@/utils/cronStats'
import CronNextFires from '@/components/CronNextFires.vue'
import EmptyState from '@/components/EmptyState.vue'
import CronJobNotes from '@/components/CronJobNotes.vue'
import {
  loadAllCronTags,
  addCronTag,
  removeCronTag,
  uniqueCronTags,
  filterJobsByTag,
} from '@/utils/cronTags'
import { useCronAliases } from '@/composables/useCronAliases'
import { filterCronJobsByQuery } from '@/utils/cronSearchFilter'
import { loadPins, togglePin as cronTogglePin, isPinned, partition } from '@/utils/cronPins'
import {
  loadArchived as loadCronArchived,
  archiveJob as doArchiveJob,
  unarchiveJob as doUnarchiveJob,
} from '@/utils/cronArchive'
import { CRON_FILTER_DEFAULTS, hasActiveCronFilters } from '@/utils/cronFilterDefaults'

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
// Cron archive
// ---------------------------------------------------------------------------
const archivedIds = ref<Set<string>>(loadCronArchived())
const showArchived = ref(false)

function onArchiveJob(id: string): void {
  archivedIds.value = doArchiveJob(id)
  showToast('已封存', 'info')
}

function onUnarchiveJob(id: string): void {
  archivedIds.value = doUnarchiveJob(id)
  showToast('已還原', 'info')
}

// ---------------------------------------------------------------------------
// Cron pins
// ---------------------------------------------------------------------------
const pinnedIds = ref<string[]>(loadPins())

function onTogglePin(id: string): void {
  pinnedIds.value = cronTogglePin(id)
  const pinned = isPinned(pinnedIds.value, id)
  showToast(pinned ? '📌 已釘選' : '取消釘選', 'info')
}

// ---------------------------------------------------------------------------
// Cron aliases
// ---------------------------------------------------------------------------
const { displayName: displayCronName, setAlias, clearAlias } = useCronAliases()

// Inline rename state
const renamingJobId = ref<string | null>(null)
const editingAlias = ref('')

function startRename(job: CronJob): void {
  renamingJobId.value = job.id
  editingAlias.value = displayCronName(job.id, job.name)
}

function commitRename(jobId: string, fallbackName: string): void {
  if (renamingJobId.value !== jobId) return
  const trimmed = editingAlias.value.trim()
  if (trimmed === '' || trimmed === fallbackName) {
    clearAlias(jobId)
    showToast('已清除別名', 'info')
  } else {
    setAlias(jobId, trimmed)
    showToast(`已更名為: ${trimmed}`, 'success')
  }
  renamingJobId.value = null
  editingAlias.value = ''
}

function cancelRename(): void {
  renamingJobId.value = null
  editingAlias.value = ''
}

// ---------------------------------------------------------------------------
// Cron tags
// ---------------------------------------------------------------------------
const cronTagsMap = ref<Map<string, string[]>>(loadAllCronTags())
const selectedCronTag = ref<string | null>(null)

// ---------------------------------------------------------------------------
// Computed
// ---------------------------------------------------------------------------

const filteredJobs = computed<CronJob[]>(() => {
  // 1. Fuzzy search across id, display name (alias-aware), description, schedule.expr
  let result = filterCronJobsByQuery(
    jobs.value,
    searchQuery.value,
    (j) => displayCronName(j.id, j.name),
  )

  // 2. Filter by enabled/disabled
  if (filterMode.value === 'enabled') {
    result = result.filter((j) => j.enabled)
  } else if (filterMode.value === 'disabled') {
    result = result.filter((j) => !j.enabled)
  }

  // 3. Filter by selected tag
  result = filterJobsByTag(result, cronTagsMap.value, selectedCronTag.value)

  // 4. Sort
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

  // 5. Float pinned jobs to top
  const { pinned, rest } = partition(result, pinnedIds.value)
  return [...pinned, ...rest]
})

const activeJobs = computed<CronJob[]>(() =>
  filteredJobs.value.filter((j) => !archivedIds.value.has(j.id)),
)

const archivedJobs = computed<CronJob[]>(() =>
  filteredJobs.value.filter((j) => archivedIds.value.has(j.id)),
)

const hasJobs = computed(() => jobs.value.length > 0)
const hasResults = computed(() => activeJobs.value.length > 0 || archivedJobs.value.length > 0)
const isFiltered = computed(
  () => searchQuery.value.trim() !== '' || filterMode.value !== 'all' || selectedCronTag.value !== null,
)
const availableCronTags = computed(() => uniqueCronTags(cronTagsMap.value))

const cronFiltersActive = computed(() =>
  hasActiveCronFilters({
    searchQuery: searchQuery.value,
    selectedTag: selectedCronTag.value,
    filterMode: filterMode.value,
    showArchived: showArchived.value,
  }),
)

const stats = computed(() =>
  computeCronStats({
    jobs: jobs.value,
    archivedIds: archivedIds.value,
    pinnedIds: pinnedIds.value,
    tagsMap: cronTagsMap.value,
  }),
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
// Clear all filters
// ---------------------------------------------------------------------------

function clearAllCronFilters(): void {
  searchQuery.value = CRON_FILTER_DEFAULTS.searchQuery
  selectedCronTag.value = CRON_FILTER_DEFAULTS.selectedTag
  filterMode.value = CRON_FILTER_DEFAULTS.filterMode
  showArchived.value = CRON_FILTER_DEFAULTS.showArchived
  showToast('已清除所有篩選', 'info')
}

// ---------------------------------------------------------------------------
// Tag handlers
// ---------------------------------------------------------------------------

function toggleSelectedCronTag(tag: string): void {
  selectedCronTag.value = selectedCronTag.value === tag ? null : tag
}

function onAddTag(jobId: string): void {
  const input = window.prompt('輸入 tag (不含 #):')
  if (!input) return
  const updated = addCronTag(jobId, input)
  const next = new Map(cronTagsMap.value)
  if (updated.length) next.set(jobId, updated)
  else next.delete(jobId)
  cronTagsMap.value = next
}

function onRemoveJobTag(jobId: string, tag: string): void {
  const updated = removeCronTag(jobId, tag)
  const next = new Map(cronTagsMap.value)
  if (updated.length) next.set(jobId, updated)
  else next.delete(jobId)
  cronTagsMap.value = next
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
    <EmptyState
      v-else-if="!hasJobs"
      variant="cron"
      title="沒有 Cron 任務"
      description="目前沒有已排程的定時任務"
    />

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

        <button
          v-if="cronFiltersActive"
          class="cron-clear-all"
          @click="clearAllCronFilters"
        >
          清除全部篩選 ✕
        </button>
      </div>

      <!-- Tag chip bar -->
      <div v-if="availableCronTags.length" class="cron-tag-chips">
        <button
          v-for="t in availableCronTags"
          :key="t.tag"
          :class="['tag-chip', { 'is-active': selectedCronTag === t.tag }]"
          @click="toggleSelectedCronTag(t.tag)"
        >
          #{{ t.tag }}
          <span class="tag-chip-count">{{ t.count }}</span>
        </button>
      </div>

      <!-- Empty state: jobs exist but none match filters -->
      <EmptyState
        v-if="!hasResults"
        variant="cron"
        title="沒有符合條件"
        :description="isFiltered ? '請嘗試調整搜尋或篩選條件' : '目前沒有已排程的定時任務'"
      />

      <!-- Cron job grid (active jobs only) -->
      <div v-else class="cron-grid">
        <div
          v-for="job in activeJobs"
          :key="job.id"
          :class="['agent-card', { dormant: !job.enabled, 'cron-pinned': isPinned(pinnedIds, job.id) }]"
          style="cursor: default"
        >
          <!-- Card header -->
          <div class="agent-card-header">
            <!-- Name block -->
            <div class="agent-card-name">
              <div class="agent-avatar">⏰</div>
              <div>
                <!-- Inline rename input -->
                <div v-if="renamingJobId === job.id" class="cron-rename-row">
                  <input
                    v-model="editingAlias"
                    class="cron-rename-input"
                    type="text"
                    autofocus
                    @keydown.enter.prevent="commitRename(job.id, job.name)"
                    @keydown.esc.prevent="cancelRename"
                    @blur="commitRename(job.id, job.name)"
                  />
                </div>
                <!-- Display name with rename button -->
                <div v-else class="cron-name-row">
                  <span class="agent-name" :title="job.id">{{ displayCronName(job.id, job.name) }}</span>
                  <button
                    class="cron-rename-btn"
                    title="重新命名"
                    @click.stop="startRename(job)"
                  >✏️</button>
                </div>
                <small v-if="displayCronName(job.id, job.name) !== job.name && renamingJobId !== job.id" class="cron-original-id" :title="job.id">{{ job.name }}</small>
                <div class="agent-hostname">
                  {{ job.schedule?.expr ?? 'Once' }}
                  <small v-if="job.schedule?.expr" class="cron-human">· {{ humanizeCron(job.schedule.expr) }}</small>
                </div>
                <CronNextFires v-if="job.schedule?.expr" :expression="job.schedule.expr" />
              </div>
            </div>

            <!-- Controls -->
            <div style="display: flex; align-items: center; gap: 8px">
              <!-- Pin button -->
              <button
                :class="['cron-pin-btn', { 'is-pinned': isPinned(pinnedIds, job.id) }]"
                :title="isPinned(pinnedIds, job.id) ? '取消釘選' : '釘選到最上'"
                @click="onTogglePin(job.id)"
              >
                📌
              </button>

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

              <!-- Archive button -->
              <button
                class="cron-archive-btn"
                title="封存任務"
                @click="onArchiveJob(job.id)"
              >
                📦
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

            <!-- Tags row -->
            <div class="cron-tags-row">
              <span
                v-for="t in (cronTagsMap.get(job.id) ?? [])"
                :key="t"
                class="job-tag-pill"
                role="button"
                tabindex="0"
                :title="`移除 #${t}`"
                @click="onRemoveJobTag(job.id, t)"
                @keydown.enter.prevent="onRemoveJobTag(job.id, t)"
                @keydown.space.prevent="onRemoveJobTag(job.id, t)"
              >#{{ t }} ✕</span>
              <button class="add-tag-btn" title="新增 tag" @click="onAddTag(job.id)">+ tag</button>
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

          <!-- Per-job collapsible notes -->
          <CronJobNotes :job-id="job.id" />
        </div>
      </div>

      <!-- Archived section toggle -->
      <button
        v-if="archivedJobs.length > 0"
        class="cron-archived-toggle"
        @click="showArchived = !showArchived"
      >
        {{ showArchived ? '隱藏已封存' : `顯示已封存 (${archivedJobs.length})` }}
      </button>

      <!-- Archived jobs grid -->
      <div v-if="showArchived && archivedJobs.length > 0" class="cron-grid cron-archived-grid">
        <div
          v-for="job in archivedJobs"
          :key="job.id"
          class="agent-card cron-archived-card"
          style="cursor: default"
        >
          <!-- Card header -->
          <div class="agent-card-header">
            <!-- Name block -->
            <div class="agent-card-name">
              <div class="agent-avatar">📦</div>
              <div>
                <div class="cron-name-row">
                  <span class="agent-name" :title="job.id">{{ displayCronName(job.id, job.name) }}</span>
                </div>
                <div class="agent-hostname">
                  {{ job.schedule?.expr ?? 'Once' }}
                </div>
              </div>
            </div>

            <!-- Restore button -->
            <div style="display: flex; align-items: center; gap: 8px">
              <button
                class="cron-unarchive-btn"
                title="還原任務"
                @click="onUnarchiveJob(job.id)"
              >
                還原
              </button>
            </div>
          </div>

          <!-- Card body (minimal) -->
          <div class="agent-card-body">
            <div class="agent-info-row">
              <span class="agent-info-label">排程</span>
              <span class="agent-info-value">{{ job.schedule?.expr ?? '一次性' }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Stats footer -->
      <footer v-if="jobs.length" class="cron-stats-footer">
        <span class="stat">共 {{ stats.total }} 個 jobs</span>
        <span class="stat">啟用 {{ stats.enabled }}</span>
        <span class="stat">已封存 {{ stats.archived }}</span>
        <span class="stat">釘選 {{ stats.pinned }}</span>
        <span class="stat">{{ stats.tagCount }} 個 tag</span>
      </footer>
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

.cron-clear-all {
  padding: 5px 11px;
  font-size: 12px;
  border: 1px solid rgba(239, 68, 68, 0.35);
  border-radius: 5px;
  background: rgba(239, 68, 68, 0.08);
  color: #ef4444;
  cursor: pointer;
  white-space: nowrap;
  transition:
    background 0.15s,
    border-color 0.15s;
}

.cron-clear-all:hover {
  background: rgba(239, 68, 68, 0.16);
  border-color: rgba(239, 68, 68, 0.6);
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

/* ── Tag chip bar ──────────────────────────────────────────────────── */

.cron-tag-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 0 0 12px;
}

.tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 9px;
  font-size: 12px;
  border: 1px solid var(--border, rgba(255, 255, 255, 0.12));
  border-radius: 12px;
  background: transparent;
  color: var(--text-muted, #94a3b8);
  cursor: pointer;
}

.tag-chip:hover {
  background: var(--surface2, rgba(255, 255, 255, 0.07));
  color: var(--text, #e2e8f0);
}

.tag-chip.is-active {
  background: var(--accent, #6366f1);
  border-color: var(--accent, #6366f1);
  color: #fff;
}

.tag-chip-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  font-size: 10px;
  font-weight: 600;
}

/* ── Per-job tag pills ─────────────────────────────────────────────── */

.cron-tags-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  margin-top: 8px;
}

.job-tag-pill {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 7px;
  font-size: 11px;
  border-radius: 10px;
  background: var(--surface2, rgba(255, 255, 255, 0.08));
  border: 1px solid var(--border, rgba(255, 255, 255, 0.12));
  color: var(--text-muted, #94a3b8);
  cursor: pointer;
}

.job-tag-pill:hover {
  background: rgba(239, 68, 68, 0.12);
  border-color: rgba(239, 68, 68, 0.3);
  color: #ef4444;
}

.add-tag-btn {
  padding: 2px 7px;
  font-size: 11px;
  border: 1px dashed var(--border, rgba(255, 255, 255, 0.18));
  border-radius: 10px;
  background: transparent;
  color: var(--text-muted, #94a3b8);
  cursor: pointer;
}

.add-tag-btn:hover {
  border-color: var(--accent, #6366f1);
  color: var(--accent, #6366f1);
}

/* ── Cron alias rename ─────────────────────────────────────────────── */

.cron-name-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.cron-rename-btn {
  padding: 0 4px;
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 12px;
  opacity: 0.45;
  line-height: 1;
  transition: opacity 0.15s;
}

.cron-rename-btn:hover {
  opacity: 1;
}

.cron-rename-row {
  display: flex;
  align-items: center;
}

.cron-rename-input {
  font-size: 14px;
  font-weight: 600;
  padding: 2px 6px;
  border: 1px solid var(--accent, #6366f1);
  border-radius: 4px;
  background: var(--surface2, rgba(255, 255, 255, 0.05));
  color: var(--text, #e2e8f0);
  outline: none;
  width: 100%;
  max-width: 200px;
}

.cron-original-id {
  display: block;
  font-size: 10px;
  color: var(--text-muted, #94a3b8);
  margin-top: 1px;
}

/* ── Cron pin button ─────────────────────────────────────────────── */

.cron-pin-btn {
  padding: 0 4px;
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 14px;
  opacity: 0.3;
  line-height: 1;
  transition: opacity 0.15s;
}

.cron-pin-btn:hover {
  opacity: 0.8;
}

.cron-pin-btn.is-pinned {
  opacity: 1;
}

/* ── Pinned card accent border ───────────────────────────────────── */

.agent-card.cron-pinned {
  border-left: 3px solid var(--accent, #6366f1);
}

/* ── Archive button ──────────────────────────────────────────────── */

.cron-archive-btn {
  padding: 0 4px;
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 14px;
  opacity: 0.35;
  line-height: 1;
  transition: opacity 0.15s;
}

.cron-archive-btn:hover {
  opacity: 0.9;
}

/* ── Archived section toggle ─────────────────────────────────────── */

.cron-archived-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 16px;
  padding: 6px 14px;
  font-size: 12px;
  border: 1px dashed var(--border, rgba(255, 255, 255, 0.18));
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted, #94a3b8);
  cursor: pointer;
  transition:
    background 0.15s,
    color 0.15s,
    border-color 0.15s;
}

.cron-archived-toggle:hover {
  background: var(--surface2, rgba(255, 255, 255, 0.05));
  color: var(--text, #e2e8f0);
  border-color: var(--accent, #6366f1);
}

/* ── Archived grid ───────────────────────────────────────────────── */

.cron-archived-grid {
  margin-top: 10px;
}

.cron-archived-card {
  opacity: 0.55;
  border-style: dashed;
}

/* ── Restore (unarchive) button ──────────────────────────────────── */

.cron-unarchive-btn {
  padding: 4px 10px;
  font-size: 12px;
  border: 1px solid var(--border, rgba(255, 255, 255, 0.2));
  border-radius: 4px;
  background: transparent;
  color: var(--text-muted, #94a3b8);
  cursor: pointer;
  transition:
    background 0.15s,
    color 0.15s,
    border-color 0.15s;
}

.cron-unarchive-btn:hover {
  background: var(--surface2, rgba(255, 255, 255, 0.07));
  color: var(--text, #e2e8f0);
  border-color: var(--accent, #6366f1);
}

/* ── Stats footer ────────────────────────────────────────────────── */

.cron-stats-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0;
  margin-top: 16px;
  padding: 8px 12px;
  border: 1px solid var(--border, rgba(255, 255, 255, 0.12));
  border-radius: 6px;
  background: var(--surface2, rgba(255, 255, 255, 0.03));
}

.cron-stats-footer .stat {
  font-size: 11px;
  color: var(--text-muted, #94a3b8);
  padding: 0 10px;
  line-height: 1.5;
}

.cron-stats-footer .stat + .stat {
  border-left: 1px solid var(--border, rgba(255, 255, 255, 0.12));
}

.cron-stats-footer .stat:first-child {
  padding-left: 0;
}
</style>
