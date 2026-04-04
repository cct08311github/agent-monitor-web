<script setup lang="ts">
import { ref, watch } from 'vue'
import { api } from '@/composables/useApi'
import { showToast } from '@/composables/useToast'

const props = defineProps<{
  defaultDomain: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'created'): void
}>()

const PRIORITY_MAP: Record<string, { label: string }> = {
  urgent: { label: '🔴 緊急' },
  high:   { label: '🟠 高' },
  medium: { label: '🟡 中' },
  low:    { label: '🟢 低' },
}

const domain   = ref(props.defaultDomain !== 'all' ? props.defaultDomain : 'work')
const title    = ref('')
const priority = ref('medium')
const due_date = ref('')
const project  = ref('')
const notes    = ref('')

const submitting = ref(false)

watch(() => props.defaultDomain, (d) => {
  if (d && d !== 'all') domain.value = d
})

async function handleSubmit() {
  if (!title.value.trim()) {
    showToast('標題不可空白', 'error')
    return
  }
  submitting.value = true
  try {
    const body: Record<string, unknown> = {
      domain:   domain.value,
      title:    title.value.trim(),
      priority: priority.value,
    }
    if (due_date.value)  body.due_date = due_date.value
    if (notes.value)     body.notes    = notes.value
    if (project.value)   body.project  = project.value

    const data = await api.post('/api/taskhub/tasks', body) as any
    if (!data.success) throw new Error(data.error)
    showToast('✅ 任務已建立', 'success')
    emit('created')
  } catch (e: any) {
    showToast('❌ 建立失敗: ' + e.message, 'error')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="modal-overlay" @click.self="emit('close')">
    <div class="modal-content" role="dialog" aria-modal="true">
      <!-- Header -->
      <div class="modal-header">
        <h3>＋ 新增任務</h3>
        <button class="modal-close" aria-label="關閉" @click="emit('close')">✕</button>
      </div>

      <!-- Body -->
      <div class="modal-body">
        <!-- Domain -->
        <div class="th-form-row">
          <label>Domain</label>
          <select v-model="domain">
            <option value="work">💼 Work</option>
            <option value="personal">🏠 Personal</option>
            <option value="sideproject">🚀 SideProject</option>
          </select>
        </div>

        <!-- Title (required) -->
        <div class="th-form-row">
          <label>標題 <span style="color:#ef4444">*</span></label>
          <input
            v-model="title"
            type="text"
            placeholder="任務標題"
            required
            autofocus
          />
        </div>

        <!-- Priority -->
        <div class="th-form-row">
          <label>優先度</label>
          <select v-model="priority">
            <option v-for="(p, v) in PRIORITY_MAP" :key="v" :value="v">{{ p.label }}</option>
          </select>
        </div>

        <!-- Due date -->
        <div class="th-form-row">
          <label>到期日</label>
          <input v-model="due_date" type="date" />
        </div>

        <!-- Project -->
        <div class="th-form-row">
          <label>專案</label>
          <input v-model="project" type="text" placeholder="專案名稱（選填）" />
        </div>

        <!-- Notes -->
        <div class="th-form-row">
          <label>備註</label>
          <textarea v-model="notes" rows="3" placeholder="備註（選填）" />
        </div>

        <!-- Buttons -->
        <div style="display:flex;gap:8px;margin-top:16px">
          <button
            class="ctrl-btn accent"
            style="flex:1"
            :disabled="submitting"
            @click="handleSubmit"
          >{{ submitting ? '建立中...' : '✓ 建立任務' }}</button>
          <button class="ctrl-btn" style="flex:1" @click="emit('close')">取消</button>
        </div>
      </div>
    </div>
  </div>
</template>
