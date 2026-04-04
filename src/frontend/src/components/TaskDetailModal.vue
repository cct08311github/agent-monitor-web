<script setup lang="ts">
import { ref, watch } from 'vue'
import { showToast } from '@/composables/useToast'
import { confirm } from '@/composables/useConfirm'

const props = defineProps<{
  task: any
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'save', domain: string, id: string, body: Record<string, unknown>): void
  (e: 'delete', domain: string, id: string): void
}>()

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

// Form state — initialised from the task prop
const title      = ref('')
const status     = ref('')
const priority   = ref('')
const due_date   = ref('')
const tags       = ref('')
const notes      = ref('')
const project    = ref('')
const assignee   = ref('')
const ghRepo     = ref('')
const ghIssue    = ref<number | ''>('')
const ghPr       = ref<number | ''>('')
const ghBranch   = ref('')
const devStatus  = ref('')

function resetForm(t: any) {
  title.value     = t.title || ''
  status.value    = t.status || 'not_started'
  priority.value  = t.priority || 'medium'
  due_date.value  = t.due_date || ''
  tags.value      = (t.tags || []).join(', ')
  notes.value     = t.notes || ''
  project.value   = t.project || ''
  assignee.value  = t.assignee || ''
  ghRepo.value    = t.github_repo || ''
  ghIssue.value   = t.github_issue_id || ''
  ghPr.value      = t.github_pr_id || ''
  ghBranch.value  = t.github_branch || ''
  devStatus.value = t.dev_status || 'planning'
}

resetForm(props.task)
watch(() => props.task, (t) => resetForm(t), { immediate: false })

function handleSave() {
  if (!title.value.trim()) {
    showToast('標題不可空白', 'error')
    return
  }
  const body: Record<string, unknown> = {
    title:    title.value.trim(),
    status:   status.value,
    priority: priority.value,
    due_date: due_date.value || null,
    notes:    notes.value || null,
    tags:     tags.value ? tags.value.split(',').map((t) => t.trim()).filter(Boolean) : [],
  }
  const domain = props.task.domain
  if (domain !== 'personal') body.project  = project.value || null
  if (domain === 'work')     body.assignee = assignee.value || null
  if (domain === 'sideproject') {
    body.github_repo     = ghRepo.value || null
    body.github_issue_id = ghIssue.value || null
    body.github_pr_id    = ghPr.value    || null
    body.github_branch   = ghBranch.value || null
    body.dev_status      = devStatus.value || null
  }
  emit('save', domain, props.task.id, body)
}

async function handleDelete() {
  const ok = await confirm({ type: 'danger', title: '刪除任務', message: `確認刪除「${props.task.title}」？此操作無法復原。`, confirmLabel: '刪除' })
  if (!ok) return
  emit('delete', props.task.domain, props.task.id)
}
</script>

<template>
  <div class="modal-overlay" @click.self="emit('close')">
    <div class="modal-content" role="dialog" aria-modal="true">
      <!-- Header -->
      <div class="modal-header">
        <h3>
          {{ DOMAIN_EMOJI[task.domain] || '📋' }} {{ task.title }}
        </h3>
        <button class="modal-close" aria-label="關閉" @click="emit('close')">✕</button>
      </div>

      <!-- Body -->
      <div class="modal-body">
        <div class="detail-card">
          <div class="detail-card-title">
            基本資訊
            <span v-if="task.notion_dirty !== undefined" style="float:right;font-size:11px;font-weight:400">
              Notion:
              <span
                :style="task.notion_dirty
                  ? 'font-size:10px;padding:2px 6px;border-radius:4px;background:rgba(249,115,22,.15);color:#f97316'
                  : 'font-size:10px;padding:2px 6px;border-radius:4px;background:rgba(34,197,94,.15);color:#22c55e'"
              >{{ task.notion_dirty ? '待同步' : '已同步' }}</span>
            </span>
          </div>

          <!-- Title -->
          <div class="th-form-row">
            <label>標題</label>
            <input v-model="title" type="text" />
          </div>

          <!-- Status + Priority row -->
          <div style="display:flex;gap:8px">
            <div class="th-form-row" style="flex:1">
              <label>狀態</label>
              <select v-model="status">
                <option v-for="(s, v) in STATUS_MAP" :key="v" :value="v">{{ s.label }}</option>
              </select>
            </div>
            <div class="th-form-row" style="flex:1">
              <label>優先度</label>
              <select v-model="priority">
                <option v-for="(p, v) in PRIORITY_MAP" :key="v" :value="v">{{ p.label }}</option>
              </select>
            </div>
          </div>

          <!-- Due date -->
          <div class="th-form-row">
            <label>到期日</label>
            <input v-model="due_date" type="date" />
          </div>

          <!-- Project (non-personal) -->
          <div v-if="task.domain !== 'personal'" class="th-form-row">
            <label>專案</label>
            <input v-model="project" type="text" placeholder="專案名稱" />
          </div>

          <!-- Assignee (work only) -->
          <div v-if="task.domain === 'work'" class="th-form-row">
            <label>Assignee</label>
            <input v-model="assignee" type="text" placeholder="負責人" />
          </div>

          <!-- Tags -->
          <div class="th-form-row">
            <label>標籤（逗號分隔）</label>
            <input v-model="tags" type="text" placeholder="tag1, tag2" />
          </div>

          <!-- Notes -->
          <div class="th-form-row">
            <label>備註</label>
            <textarea v-model="notes" rows="3" />
          </div>

          <!-- GitHub fields (sideproject only) -->
          <template v-if="task.domain === 'sideproject'">
            <div class="detail-card-title" style="margin-top:12px">GitHub 整合</div>
            <div class="th-form-row">
              <label>GitHub Repo</label>
              <input v-model="ghRepo" type="text" placeholder="owner/repo-name" />
            </div>
            <div style="display:flex;gap:8px">
              <div class="th-form-row" style="flex:1">
                <label>Issue #</label>
                <input v-model="ghIssue" type="number" min="0" />
              </div>
              <div class="th-form-row" style="flex:1">
                <label>PR #</label>
                <input v-model="ghPr" type="number" min="0" />
              </div>
            </div>
            <div class="th-form-row">
              <label>Branch</label>
              <input v-model="ghBranch" type="text" placeholder="feat/..." />
            </div>
            <div class="th-form-row">
              <label>Dev Status</label>
              <select v-model="devStatus">
                <option v-for="v in ['planning','in_dev','code_review','testing','done']" :key="v" :value="v">{{ v }}</option>
              </select>
            </div>
          </template>
        </div>

        <!-- Action buttons -->
        <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
          <button
            class="ctrl-btn accent"
            style="flex:1"
            @click="handleSave"
          >💾 儲存</button>
          <button
            class="ctrl-btn"
            style="flex:1;background:var(--red-light,rgba(239,68,68,.1));color:#ef4444"
            @click="handleDelete"
          >🗑 刪除</button>
        </div>

        <!-- Timestamps -->
        <div style="margin-top:8px;font-size:11px;color:var(--text-muted)">
          建立 {{ (task.created_at || '').slice(0, 16) }} ／ 更新 {{ (task.updated_at || '').slice(0, 16) }}
        </div>
      </div>
    </div>
  </div>
</template>
