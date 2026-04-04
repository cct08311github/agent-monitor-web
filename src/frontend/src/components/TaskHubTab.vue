<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { api } from '@/composables/useApi'
import { showToast } from '@/composables/useToast'
import TaskDetailModal from '@/components/TaskDetailModal.vue'
import AddTaskModal from '@/components/AddTaskModal.vue'

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  not_started: { label: '未開始', cls: 'th-s-idle' },
  in_progress:  { label: '進行中', cls: 'th-s-active' },
  blocked:      { label: '封鎖中', cls: 'th-s-blocked' },
  draft:        { label: '草稿',   cls: 'th-s-idle' },
  done:         { label: '已完成', cls: 'th-s-done' },
  archived:     { label: '已封存', cls: 'th-s-muted' },
  cancelled:    { label: '已取消', cls: 'th-s-muted' },
}

const PRIORITY_MAP: Record<string, { label: string; cls: string }> = {
  urgent: { label: '🔴 緊急', cls: 'th-p-urgent' },
  high:   { label: '🟠 高',   cls: 'th-p-high' },
  medium: { label: '🟡 中',   cls: 'th-p-medium' },
  low:    { label: '🟢 低',   cls: 'th-p-low' },
}

const DOMAIN_EMOJI: Record<string, string> = { work: '💼', personal: '🏠', sideproject: '🚀' }

const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 }
const STATUS_ORDER: Record<string, number>   = {
  in_progress: 0, blocked: 1, not_started: 2, draft: 3,
  done: 4, archived: 5, cancelled: 6,
}

const domains = [
  { value: 'all',        label: '全部' },
  { value: 'work',       label: '💼 Work' },
  { value: 'personal',   label: '🏠 Personal' },
  { value: 'sideproject', label: '🚀 SideProject' },
]

const columns = [
  { label: '優先', sortKey: 'priority' },
  { label: '標題', sortKey: null },
  { label: '狀態', sortKey: 'status' },
  { label: 'Domain', sortKey: null },
  { label: '專案', sortKey: null },
  { label: '到期', sortKey: 'due_date' },
  { label: '操作', sortKey: null },
]

// ── State ─────────────────────────────────────────────────────────────────────

const domain         = ref('all')
const statusFilter   = ref('')
const priorityFilter = ref('')
const searchQuery    = ref('')
const searchTimer    = ref<ReturnType<typeof setTimeout>>()
const tasks          = ref<any[]>([])
const loading        = ref(false)
const sortCol        = ref<string | null>(null)
const sortDir        = ref<'asc' | 'desc'>('asc')
const stats          = ref<any>(null)

const editingTask    = ref<any>(null)
const showAddModal   = ref(false)

// ── Computed ──────────────────────────────────────────────────────────────────

const sortedTasks = computed(() => {
  if (!sortCol.value) return tasks.value
  return [...tasks.value].sort((a, b) => {
    let cmp = 0
    if (sortCol.value === 'priority') {
      cmp = (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99)
    } else if (sortCol.value === 'due_date') {
      const da = a.due_date || '9999', db = b.due_date || '9999'
      cmp = da < db ? -1 : da > db ? 1 : 0
    } else if (sortCol.value === 'status') {
      cmp = (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99)
    }
    return sortDir.value === 'asc' ? cmp : -cmp
  })
})

// ── Helpers ───────────────────────────────────────────────────────────────────

function isDueUrgent(dateStr: string): boolean {
  if (!dateStr) return false
  const diff = (new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  return diff <= 2
}

function toggleSort(key: string) {
  if (sortCol.value === key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortCol.value = key
    sortDir.value = 'asc'
  }
}

function setDomain(d: string) {
  domain.value = d
  fetchTasks()
}

function debounceSearch() {
  clearTimeout(searchTimer.value)
  searchTimer.value = setTimeout(fetchTasks, 400)
}

// ── API calls ─────────────────────────────────────────────────────────────────

async function fetchStats() {
  try {
    const data = await api.get('/api/taskhub/stats') as any
    if (!data.success) return
    stats.value = data.stats
  } catch (e: any) {
    console.error('[TaskHubTab] stats error:', e.message)
  }
}

async function fetchTasks() {
  loading.value = true
  try {
    const params = new URLSearchParams({ domain: domain.value, limit: '100' })
    if (statusFilter.value)   params.set('status',   statusFilter.value)
    if (priorityFilter.value) params.set('priority', priorityFilter.value)
    const q = searchQuery.value.trim()
    if (q) params.set('search', q)

    const data = await api.get('/api/taskhub/tasks?' + params.toString()) as any
    if (!data.success) throw new Error(data.error)
    tasks.value = data.tasks
  } catch (e: any) {
    showToast('❌ 載入失敗: ' + e.message, 'error')
  } finally {
    loading.value = false
  }
}

async function quickUpdateStatus(taskDomain: string, id: string, newStatus: string) {
  showToast('更新狀態...', 'info')
  try {
    const data = await api.patch(`/api/taskhub/tasks/${taskDomain}/${id}`, { status: newStatus }) as any
    if (!data.success) throw new Error(data.error)
    const idx = tasks.value.findIndex((t) => t.id === id)
    if (idx >= 0) tasks.value[idx] = data.task
    fetchStats()
  } catch (e: any) {
    showToast('❌ 更新失敗: ' + e.message, 'error')
  }
}

async function onSaveTask(taskDomain: string, id: string, body: Record<string, unknown>) {
  try {
    const data = await api.patch(`/api/taskhub/tasks/${taskDomain}/${id}`, body) as any
    if (!data.success) throw new Error(data.error)
    showToast('✅ 已儲存', 'success')
    const idx = tasks.value.findIndex((t) => t.id === id)
    if (idx >= 0) tasks.value[idx] = data.task
    editingTask.value = null
    fetchStats()
  } catch (e: any) {
    showToast('❌ 儲存失敗: ' + e.message, 'error')
  }
}

async function onDeleteTask(taskDomain: string, id: string) {
  try {
    const data = await api.del(`/api/taskhub/tasks/${taskDomain}/${id}`) as any
    if (!data.success) throw new Error(data.error)
    showToast('✅ 任務已刪除', 'success')
    tasks.value = tasks.value.filter((t) => !(t.id === id && t.domain === taskDomain))
    editingTask.value = null
    fetchStats()
  } catch (e: any) {
    showToast('❌ 刪除失敗: ' + e.message, 'error')
  }
}

function onTaskCreated() {
  showAddModal.value = false
  fetchTasks()
  fetchStats()
}

// ── Dropdown (actions menu) ───────────────────────────────────────────────────

const openDropdownId = ref<string | null>(null)

function toggleDropdown(id: string, e: Event) {
  e.stopPropagation()
  if (openDropdownId.value === id) {
    openDropdownId.value = null
  } else {
    openDropdownId.value = id
    setTimeout(() => {
      const close = () => {
        openDropdownId.value = null
        document.removeEventListener('click', close)
      }
      document.addEventListener('click', close)
    }, 0)
  }
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

onMounted(() => {
  fetchStats()
  fetchTasks()
})
</script>

<template>
  <div>
    <!-- Stats Bar -->
    <div class="taskhub-stats-bar">
      <div class="th-stat-row">
        <div
          v-for="d in ['work', 'personal', 'sideproject']"
          :key="d"
          class="th-stat-card"
        >
          <span class="th-stat-domain">{{ DOMAIN_EMOJI[d] }} {{ d.charAt(0).toUpperCase() + d.slice(1) }}</span>
          <span class="th-stat-active">{{ stats?.domains?.[d]?.active || 0 }} 待辦</span>
          <span
            v-if="stats?.domains?.[d]?.by_status?.in_progress"
            class="th-s-active th-stat-badge"
          >{{ stats.domains[d].by_status.in_progress }} 進行中</span>
          <span
            v-if="stats?.domains?.[d]?.by_status?.blocked"
            class="th-s-blocked th-stat-badge"
          >{{ stats.domains[d].by_status.blocked }} 封鎖</span>
        </div>
      </div>
    </div>

    <!-- Toolbar -->
    <div class="taskhub-toolbar">
      <div class="taskhub-domain-tabs">
        <button
          v-for="d in domains"
          :key="d.value"
          :class="['th-domain-btn', { active: domain === d.value }]"
          @click="setDomain(d.value)"
        >{{ d.label }}</button>
      </div>
      <div class="taskhub-filters">
        <select v-model="statusFilter" @change="fetchTasks()">
          <option value="">全部狀態</option>
          <option v-for="(s, v) in STATUS_MAP" :key="v" :value="v">{{ s.label }}</option>
        </select>
        <select v-model="priorityFilter" @change="fetchTasks()">
          <option value="">全部優先</option>
          <option v-for="(p, v) in PRIORITY_MAP" :key="v" :value="v">{{ p.label }}</option>
        </select>
        <input
          v-model="searchQuery"
          class="th-search-input"
          type="text"
          placeholder="🔍 搜尋任務..."
          @input="debounceSearch"
        />
      </div>
      <button class="ctrl-btn accent" @click="showAddModal = true">＋ 新增任務</button>
    </div>

    <!-- Task Table -->
    <div class="taskhub-grid" :class="{ 'th-hide-domain': domain !== 'all' }">
      <div v-if="loading" class="th-loading">載入中...</div>
      <div v-else-if="tasks.length === 0" class="empty-state">
        <div class="empty-state-icon"><span class="empty-icon-inner">📋</span></div>
        <div class="empty-state-title">沒有符合的任務</div>
        <div class="empty-state-desc">嘗試調整篩選條件，或新增一個任務</div>
      </div>
      <table v-else class="th-task-table">
        <thead>
          <tr>
            <th
              v-for="col in columns"
              :key="col.label"
              :class="{ 'th-sortable': col.sortKey }"
              @click="col.sortKey && toggleSort(col.sortKey)"
            >
              {{ col.label }}{{ col.sortKey && sortCol === col.sortKey ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '' }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="task in sortedTasks"
            :key="task.id"
            class="th-task-row"
            @click="editingTask = task"
          >
            <!-- Priority -->
            <td class="th-col-priority">
              <span :class="['th-priority-badge', PRIORITY_MAP[task.priority]?.cls || '']">
                {{ PRIORITY_MAP[task.priority]?.label || task.priority }}
              </span>
            </td>

            <!-- Title + notes preview -->
            <td class="th-col-title">
              <span class="th-row-title">{{ task.title }}</span>
              <span v-if="task.notes" class="th-row-notes">
                {{ task.notes.slice(0, 60) + (task.notes.length > 60 ? '…' : '') }}
              </span>
            </td>

            <!-- Status -->
            <td class="th-col-status">
              <span :class="['th-status-badge', STATUS_MAP[task.status]?.cls || '']">
                {{ STATUS_MAP[task.status]?.label || task.status }}
              </span>
            </td>

            <!-- Domain -->
            <td class="th-col-domain">
              <span class="th-domain-badge">{{ DOMAIN_EMOJI[task.domain] || '📋' }} {{ task.domain }}</span>
            </td>

            <!-- Project + GitHub link -->
            <td class="th-col-project">
              <template v-if="task.project || task.github_issue_id">
                <span v-if="task.project" class="th-project">{{ task.project }}</span>
                <template v-if="task.github_issue_id">
                  <template v-if="task.project"> </template>
                  <a
                    :href="`https://github.com/${task.github_repo || ''}/issues/${task.github_issue_id}`"
                    target="_blank"
                    class="th-gh-link"
                    title="GitHub Issue"
                    @click.stop
                  >#{{ task.github_issue_id }}</a>
                </template>
              </template>
              <span v-else class="th-due-empty">—</span>
            </td>

            <!-- Due date -->
            <td class="th-col-due">
              <span
                v-if="task.due_date"
                :class="['th-due', { 'th-due-urgent': isDueUrgent(task.due_date) }]"
              >📅 {{ task.due_date }}</span>
              <span v-else class="th-due-empty">—</span>
            </td>

            <!-- Actions -->
            <td class="th-col-actions" @click.stop>
              <button
                v-if="task.status === 'not_started'"
                class="th-action-btn th-btn-start"
                @click="quickUpdateStatus(task.domain, task.id, 'in_progress')"
              >▶ 開始</button>
              <button
                v-else-if="task.status === 'in_progress'"
                class="th-action-btn th-btn-done"
                @click="quickUpdateStatus(task.domain, task.id, 'done')"
              >✓ 完成</button>
              <button
                v-else-if="task.status === 'blocked'"
                class="th-action-btn th-btn-start"
                @click="quickUpdateStatus(task.domain, task.id, 'in_progress')"
              >▶ 恢復</button>

              <div
                v-if="!['done', 'archived', 'cancelled'].includes(task.status)"
                :class="['th-dropdown', { 'th-dropdown-open': openDropdownId === task.id }]"
              >
                <button
                  class="th-action-btn th-btn-more"
                  @click="toggleDropdown(task.id, $event)"
                >⋯</button>
                <div class="th-dropdown-menu">
                  <button
                    v-if="task.status === 'in_progress'"
                    @click="quickUpdateStatus(task.domain, task.id, 'blocked'); openDropdownId = null"
                  >⛔ 封鎖</button>
                  <button
                    @click="editingTask = task; openDropdownId = null"
                  >✏️ 編輯</button>
                </div>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Task Detail Modal (edit) -->
    <TaskDetailModal
      v-if="editingTask"
      :task="editingTask"
      @close="editingTask = null"
      @save="onSaveTask"
      @delete="onDeleteTask"
    />

    <!-- Add Task Modal -->
    <AddTaskModal
      v-if="showAddModal"
      :default-domain="domain"
      @close="showAddModal = false"
      @created="onTaskCreated"
    />
  </div>
</template>
