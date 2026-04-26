<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount, onMounted, nextTick } from 'vue'
import { loadCronNote, saveCronNote, clearCronNote } from '@/utils/cronNotes'
import { relativeTimeFromNow } from '@/utils/relativeTime'
import { useToast } from '@/composables/useToast'

// ── Props ─────────────────────────────────────────────────────────────────────

const props = defineProps<{
  jobId: string
}>()

// ── State ─────────────────────────────────────────────────────────────────────

const text = ref('')
const updatedAt = ref<number | null>(null)
const relativeLabel = ref('尚未儲存')

// ── Debounce save ─────────────────────────────────────────────────────────────

let debounceTimer: ReturnType<typeof setTimeout> | null = null
// Track the jobId that owns the pending debounced save
let pendingJobId: string = ''

function flushPendingSaveFor(jobId: string): void {
  if (debounceTimer !== null && pendingJobId === jobId) {
    clearTimeout(debounceTimer)
    debounceTimer = null
    pendingJobId = ''
    const note = saveCronNote(jobId, text.value)
    updatedAt.value = note.updatedAt
  }
}

function scheduleSave(jobId: string, value: string): void {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer)
  }
  pendingJobId = jobId
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    pendingJobId = ''
    const note = saveCronNote(jobId, value)
    updatedAt.value = note.updatedAt
  }, 800)
}

// ── Load note for current job ─────────────────────────────────────────────────

// Flag: true while we are programmatically loading a note (to suppress auto-save)
let isLoading = false

async function loadForJob(jobId: string): Promise<void> {
  isLoading = true
  const note = loadCronNote(jobId)
  text.value = note?.text ?? ''
  updatedAt.value = note?.updatedAt ?? null
  // Wait one tick for the watcher to run (and be suppressed), then unblock
  await nextTick()
  isLoading = false
}

onMounted(() => {
  void loadForJob(props.jobId)
})

// Watch text changes for auto-save. Skip any change triggered by loadForJob.
watch(
  () => text.value,
  (newVal) => {
    if (isLoading) return
    scheduleSave(props.jobId, newVal)
  },
)

// Watch jobId changes: flush pending save for previous job, then load new
watch(
  () => props.jobId,
  (newId, oldId) => {
    // Flush any pending save for the PREVIOUS job before switching
    flushPendingSaveFor(oldId)
    void loadForJob(newId)
  },
)

onBeforeUnmount(() => {
  // Save any pending changes for the current job before unmounting
  flushPendingSaveFor(pendingJobId || props.jobId)
})

// ── Relative-time refresh ─────────────────────────────────────────────────────

function updateLabel(): void {
  if (updatedAt.value === null) {
    relativeLabel.value = '尚未儲存'
  } else {
    relativeLabel.value = relativeTimeFromNow(updatedAt.value)
  }
}

updateLabel()

const relativeTimer = setInterval(() => {
  updateLabel()
}, 10_000)

watch(updatedAt, () => {
  updateLabel()
})

onBeforeUnmount(() => {
  clearInterval(relativeTimer)
})

// ── Clear ─────────────────────────────────────────────────────────────────────

const toast = useToast()

function onClear(): void {
  if (!window.confirm('確定要清除這個 cron job 的筆記嗎？')) return
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  clearCronNote(props.jobId)
  text.value = ''
  updatedAt.value = null
  toast.info('筆記已清除')
}

// ── Indicator ────────────────────────────────────────────────────────────────

const existingHasContent = computed(() => text.value.trim().length > 0 || updatedAt.value !== null)
</script>

<template>
  <details class="cron-job-notes-wrapper">
    <summary class="cron-job-notes-summary">📝 筆記{{ existingHasContent ? ' ●' : '' }}</summary>
    <div class="cron-job-notes-body">
      <textarea
        v-model="text"
        class="cron-job-notes-textarea"
        rows="4"
        placeholder="在這裡寫下關於這個 cron job 的觀察、TODO、context..."
      ></textarea>
      <div class="cron-job-notes-footer">
        <span class="cron-job-notes-meta">{{ text.length }} 字 · 上次儲存: {{ relativeLabel }}</span>
        <button
          v-if="text.length > 0 || updatedAt !== null"
          type="button"
          class="cron-job-notes-clear-btn"
          @click="onClear"
        >
          清除
        </button>
      </div>
    </div>
  </details>
</template>

<style scoped>
.cron-job-notes-wrapper {
  margin-top: 8px;
}

.cron-job-notes-summary {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted, #6c7086);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  cursor: pointer;
  list-style: none;
  user-select: none;
}

.cron-job-notes-summary::-webkit-details-marker {
  display: none;
}

.cron-job-notes-summary:hover {
  color: var(--text, #cdd6f4);
}

.cron-job-notes-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 6px;
}

.cron-job-notes-textarea {
  width: 100%;
  resize: vertical;
  font-size: 12px;
  line-height: 1.55;
  padding: 8px 10px;
  border-radius: 6px;
  border: 1px solid var(--border, #45475a);
  background: var(--bg-secondary, #1e1e2e);
  color: var(--text, #cdd6f4);
  outline: none;
  font-family: inherit;
  transition: border-color 0.15s ease;
  box-sizing: border-box;
}

.cron-job-notes-textarea::placeholder {
  color: var(--text-muted, #6c7086);
  font-style: italic;
}

.cron-job-notes-textarea:focus {
  border-color: var(--blue, #89b4fa);
}

.cron-job-notes-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.cron-job-notes-meta {
  font-size: 10px;
  color: var(--text-muted, #6c7086);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cron-job-notes-clear-btn {
  background: none;
  border: 1px solid var(--border, #45475a);
  border-radius: 4px;
  color: var(--text-muted, #6c7086);
  font-size: 11px;
  padding: 2px 8px;
  cursor: pointer;
  flex-shrink: 0;
  transition:
    border-color 0.15s ease,
    color 0.15s ease;
}

.cron-job-notes-clear-btn:hover {
  border-color: var(--red, #f38ba8);
  color: var(--red, #f38ba8);
}
</style>
