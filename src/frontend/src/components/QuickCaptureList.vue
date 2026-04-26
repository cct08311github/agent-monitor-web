<script setup lang="ts">
/**
 * QuickCaptureList — lists all saved quick captures.
 *
 * Opens from the KeyboardShortcutsHelp footer button.
 * Supports per-item archive (📦 hides from main list, preserves data),
 * per-item delete (with confirm), and "clear all" (with confirm).
 * Archived items can be revealed via the toggle and restored with 還原.
 * Tag chips bar above list allows filtering by #hashtag.
 * Esc or backdrop click closes the modal.
 * 📥 Download button exports all captures as a grouped Markdown file.
 */
import { watch, nextTick, onMounted, onUnmounted, ref, computed } from 'vue'
import { useQuickCapture } from '@/composables/useQuickCapture'
import { useBulkSelect } from '@/composables/useBulkSelect'
import { createFocusTrap } from '@/lib/focusTrap'
import { tagCounts, captureHasTag } from '@/utils/quickCaptureTags'
import { buildExport } from '@/utils/quickCaptureExport'
import { isClipboardWriteSupported, writeClipboardText } from '@/utils/clipboardWrite'
import { formatCaptureForClipboard } from '@/utils/captureFormat'
import { useToast } from '@/composables/useToast'
import { fuzzyScore } from '@/utils/fuzzyScore'
import { partition } from '@/utils/capturePins'
import { filterByDateRange, RANGE_LABELS } from '@/utils/captureDateFilter'
import type { DateRange } from '@/utils/captureDateFilter'
import type { Capture } from '@/utils/quickCapture'
import { loadSortOrder, saveSortOrder } from '@/utils/captureSortPref'
import type { SortOrder } from '@/utils/captureSortPref'
import { groupByDay } from '@/utils/captureTimeline'
import { loadViewMode, saveViewMode } from '@/utils/captureViewMode'
import type { ViewMode } from '@/utils/captureViewMode'
import CaptureHeatmap from './CaptureHeatmap.vue'
import CaptureBulkActionBar from './CaptureBulkActionBar.vue'

const { isListOpen, captures, activeCaptures, archivedCaptures, pinnedIds, closeList, remove, archive, unarchive, clear, update, togglePin, isPinned, openWithPrefill } = useQuickCapture()

// ---------------------------------------------------------------------------
// Bulk selection
// ---------------------------------------------------------------------------

const bulk = useBulkSelect()

// Inline edit state
const editingId = ref<string | null>(null)
const editingText = ref<string>('')

// Date range filtering
const dateRange = ref<DateRange>('all')

// Tag filtering
const selectedTag = ref<string | null>(null)

// Search
const searchQuery = ref('')

// Archive section visibility
const showArchived = ref(false)

// View mode: 'flat' = plain list (default), 'timeline' = grouped by day
const viewMode = ref<ViewMode>(loadViewMode())

function toggleViewMode(): void {
  viewMode.value = viewMode.value === 'flat' ? 'timeline' : 'flat'
  saveViewMode(viewMode.value)
}

// Sort order: 'desc' = newest first (default), 'asc' = oldest first
const sortOrder = ref<SortOrder>(loadSortOrder())

const sortLabel = computed(() =>
  sortOrder.value === 'desc' ? '目前：新→舊，點擊切換為舊→新' : '目前：舊→新，點擊切換為新→舊',
)

function toggleSort(): void {
  sortOrder.value = sortOrder.value === 'desc' ? 'asc' : 'desc'
  saveSortOrder(sortOrder.value)
}

const tags = computed(() => tagCounts(captures.value))

function applyFilters(list: Capture[]): Capture[] {
  // Date range is applied first (broadest filter)
  list = filterByDateRange(list, dateRange.value)
  if (selectedTag.value) list = list.filter((c) => captureHasTag(c, selectedTag.value!))
  const q = searchQuery.value.trim()
  if (q) {
    list = list
      .map((c) => ({ c, score: fuzzyScore(q, c.body) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.c)
  }
  return list
}

const displayed = computed(() => {
  // Sort by createdAt first so both pinned and rest groups respect sortOrder.
  // Search-ranked results skip the time sort (fuzzyScore already orders them).
  const base = [...activeCaptures.value]
  const q = searchQuery.value.trim()
  const sorted = q
    ? base
    : base.sort((a, b) =>
        sortOrder.value === 'desc' ? b.createdAt - a.createdAt : a.createdAt - b.createdAt,
      )
  const filtered = applyFilters(sorted)
  // Float pinned items to the top; both groups remain in sortOrder order.
  const { pinned, rest } = partition(filtered, pinnedIds.value)
  return [...pinned, ...rest]
})

const displayedArchived = computed(() => applyFilters([...archivedCaptures.value]))

// Keep bulk select aware of current displayed ids
watch(
  displayed,
  (list) => {
    bulk.setAllIds(list.map((c) => c.id))
  },
  { immediate: true },
)

// When the list closes, clear selection
watch(isListOpen, (open) => {
  if (!open) bulk.clear()
})

// Whether ANY selected capture is currently archived (determines bar mode)
const bulkHasArchived = computed(() =>
  [...bulk.selected.value].some((id) => archivedCaptures.value.some((c) => c.id === id)),
)

function onRowCheckboxClick(e: MouseEvent, id: string): void {
  bulk.toggle(id, { shift: e.shiftKey })
}

function onHeaderCheckboxClick(): void {
  if (bulk.allSelected.value) {
    bulk.clear()
  } else {
    bulk.selectAll()
  }
}

function bulkArchive(): void {
  const ids = [...bulk.selected.value]
  for (const id of ids) archive(id)
  useToast().info(`已封存 ${ids.length} 個 capture`)
  bulk.clear()
}

function bulkUnarchive(): void {
  const ids = [...bulk.selected.value]
  for (const id of ids) unarchive(id)
  useToast().info(`已還原 ${ids.length} 個 capture`)
  bulk.clear()
}

function bulkTogglePin(): void {
  const ids = [...bulk.selected.value]
  for (const id of ids) togglePin(id)
  useToast().info(`已切換 ${ids.length} 個 pin 狀態`)
  bulk.clear()
}

function bulkDelete(): void {
  const ids = [...bulk.selected.value]
  if (!window.confirm(`確認刪除已選取的 ${ids.length} 個 capture？`)) return
  for (const id of ids) remove(id)
  useToast().info(`已刪除 ${ids.length} 個 capture`)
  bulk.clear()
}

// In timeline mode: pinned items stay as a flat block at the top;
// the rest section is grouped by day.  Partition is based on displayed.value
// which already floats pinned to the front.
const pinnedDisplayed = computed(() => {
  const { pinned } = partition(displayed.value, pinnedIds.value)
  return pinned
})

const restDisplayed = computed(() => {
  const { rest } = partition(displayed.value, pinnedIds.value)
  return rest
})

const groupedDisplay = computed(() => groupByDay(restDisplayed.value))

function toggleTag(tag: string): void {
  selectedTag.value = selectedTag.value === tag ? null : tag
}

function clearTagFilter(): void {
  selectedTag.value = null
}

const dialogRef = ref<HTMLDivElement | null>(null)
const trap = createFocusTrap()

watch(isListOpen, async (visible) => {
  if (visible) {
    await nextTick()
    if (dialogRef.value) {
      trap.activate(dialogRef.value, () => closeList())
    }
    dialogRef.value?.focus()
  } else {
    trap.deactivate()
  }
})

onUnmounted(() => {
  trap.deactivate()
  window.removeEventListener('keydown', onKeydown)
})

function handleClose(): void {
  closeList()
}

function handleEsc(): void {
  // If a selection is active, Esc clears it first without closing the modal
  if (bulk.count.value > 0) {
    bulk.clear()
    return
  }
  closeList()
}

function handlePin(c: Capture): void {
  const wasPinned = isPinned(c.id)
  togglePin(c.id)
  useToast().info(wasPinned ? '已取消釘選' : '已釘選')
}

function handleArchive(c: Capture): void {
  archive(c.id)
  useToast().info('已封存')
}

function handleUnarchive(c: Capture): void {
  unarchive(c.id)
  useToast().info('已還原')
}

function handleDelete(c: Capture): void {
  if (window.confirm(`刪除此 capture？\n\n「${c.body.slice(0, 60)}${c.body.length > 60 ? '…' : ''}」`)) {
    remove(c.id)
  }
}

function handleClearAll(): void {
  const total = captures.value.length
  if (window.confirm(`確認清空所有 ${total} 筆 quick capture（含封存）？`)) {
    clear()
    showArchived.value = false
  }
}

function handleClone(c: Capture): void {
  openWithPrefill(c.body)
  useToast().info('已開啟新 capture，可編輯後儲存')
}

async function handleCopy(c: Capture): Promise<void> {
  const text = formatCaptureForClipboard(c)
  const ok = await writeClipboardText(text)
  const toast = useToast()
  if (ok) {
    toast.success('已複製到剪貼簿')
  } else {
    toast.warning('無法寫入剪貼簿')
  }
}

function startEdit(c: Capture): void {
  editingId.value = c.id
  editingText.value = c.body
}

function cancelEdit(): void {
  editingId.value = null
  editingText.value = ''
}

function commitEdit(id: string): void {
  const trimmed = editingText.value.trim()
  if (!trimmed) {
    if (window.confirm('內容為空，是否刪除這筆 capture？')) {
      remove(id)
      useToast().info('已刪除空 capture')
    }
    cancelEdit()
    return
  }
  update(id, trimmed)
  editingId.value = null
  editingText.value = ''
  useToast().success('已儲存')
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString()
}

// ---------------------------------------------------------------------------
// Keyboard navigation
// ---------------------------------------------------------------------------

/**
 * Keyboard navigation is only active in flat mode.
 * In timeline mode navigation is disabled to avoid ambiguity with grouped items.
 */
const highlightedIdx = ref<number>(-1)

// Reset highlight when displayed list changes (e.g. filter applied) or modal opens
watch(displayed, () => {
  highlightedIdx.value = -1
})

watch(isListOpen, (open) => {
  if (!open) highlightedIdx.value = -1
})

function onKeydown(e: KeyboardEvent): void {
  if (!isListOpen.value) return
  // Skip nav when an input/textarea/contenteditable has focus
  const t = e.target as HTMLElement | null
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
  // Skip nav in timeline mode — list is split into grouped sections
  if (viewMode.value === 'timeline') return

  const list = displayed.value
  const len = list.length
  if (len === 0) return

  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault()
      highlightedIdx.value = Math.min(len - 1, highlightedIdx.value + 1)
      break
    case 'ArrowUp':
      e.preventDefault()
      highlightedIdx.value = Math.max(0, highlightedIdx.value < 0 ? 0 : highlightedIdx.value - 1)
      break
    case 'Enter':
      if (highlightedIdx.value >= 0 && highlightedIdx.value < len) {
        e.preventDefault()
        startEdit(list[highlightedIdx.value])
      }
      break
    case 'Delete':
    case 'Backspace':
      if (highlightedIdx.value >= 0 && highlightedIdx.value < len) {
        e.preventDefault()
        handleDelete(list[highlightedIdx.value])
      }
      break
    case ' ':
      if (highlightedIdx.value >= 0 && highlightedIdx.value < len) {
        e.preventDefault()
        bulk.toggle(list[highlightedIdx.value].id)
      }
      break
    case 'a':
    case 'A':
      if (e.metaKey || e.ctrlKey) {
        e.preventDefault()
        bulk.selectAll()
      }
      break
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})

function onDownload(): void {
  const { filename, content } = buildExport(captures.value)
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    a.remove()
  } finally {
    URL.revokeObjectURL(url)
  }
  useToast().success(`已匯出 ${captures.value.length} 筆 captures`)
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="isListOpen"
      class="qcl-overlay"
      aria-modal="true"
      role="dialog"
      aria-labelledby="qcl-title"
      @click.self="handleClose"
    >
      <div
        ref="dialogRef"
        class="qcl-dialog"
        tabindex="-1"
        @keydown.esc.stop="handleEsc"
      >
        <!-- Header -->
        <div class="qcl-header">
          <h2 id="qcl-title" class="qcl-title">
            💡 已捕捉的想法
            <span class="qcl-count">({{ activeCaptures.length }})</span>
          </h2>
          <div class="qcl-header-actions">
            <button
              class="qcl-download-btn"
              :disabled="!captures.length"
              aria-label="匯出所有 captures 為 Markdown 檔案"
              @click="onDownload"
            >📥 匯出 .md</button>
            <button
              class="qcl-close-btn"
              aria-label="關閉 quick capture 列表"
              @click="handleClose"
            >✕</button>
          </div>
        </div>

        <!-- Capture frequency heatmap (30 days) -->
        <div v-if="captures.length > 0" class="qcl-heatmap-row">
          <CaptureHeatmap :captures="captures" />
        </div>

        <!-- Archive toggle toolbar (only shown when archived items exist) -->
        <div v-if="archivedCaptures.length > 0" class="qcl-archive-toolbar">
          <button
            class="qcl-archive-toggle-btn"
            :aria-pressed="showArchived"
            @click="showArchived = !showArchived"
          >{{ showArchived ? '隱藏已封存' : `顯示已封存 (${archivedCaptures.length})` }}</button>
        </div>

        <!-- Search + Date-range filter row -->
        <div class="qcl-search-bar">
          <input
            v-model="searchQuery"
            type="text"
            class="qc-search"
            placeholder="搜尋 captures..."
            aria-label="搜尋 captures"
          />
          <select
            v-model="dateRange"
            class="qc-date-range"
            aria-label="日期範圍篩選"
          >
            <option v-for="(label, key) in RANGE_LABELS" :key="key" :value="key">{{ label }}</option>
          </select>
          <button
            class="qc-sort-btn"
            :title="sortLabel"
            :aria-label="sortLabel"
            @click="toggleSort"
          >{{ sortOrder === 'desc' ? '↓ 新→舊' : '↑ 舊→新' }}</button>
          <button
            class="qc-view-mode-btn"
            :class="{ 'qc-view-mode-btn--active': viewMode === 'timeline' }"
            :title="viewMode === 'flat' ? '切換為 Timeline（日期分組）' : '切換為 Flat（一般列表）'"
            :aria-label="viewMode === 'flat' ? '切換為 Timeline 日期分組模式' : '切換為 Flat 一般列表模式'"
            :aria-pressed="viewMode === 'timeline'"
            @click="toggleViewMode"
          >{{ viewMode === 'flat' ? '📅 Timeline' : '☰ Flat' }}</button>
          <span v-if="searchQuery || selectedTag || dateRange !== 'all'" class="qcl-filter-count">
            篩選: {{ displayed.length }} / {{ activeCaptures.length }}
          </span>
        </div>

        <!-- Tag chips bar (only shown when tags exist) -->
        <div v-if="tags.length > 0" class="qcl-tag-bar" role="group" aria-label="Tag 篩選">
          <button
            v-if="selectedTag !== null"
            class="tag-chip tag-chip--reset"
            @click="clearTagFilter"
          >全部</button>
          <button
            v-for="t in tags"
            :key="t.tag"
            class="tag-chip"
            :class="{ 'is-active': selectedTag === t.tag }"
            :aria-pressed="selectedTag === t.tag"
            @click="toggleTag(t.tag)"
          >#{{ t.tag }} <span class="tag-chip__count">{{ t.count }}</span></button>
        </div>

        <!-- Bulk select header row (shown when list has items) -->
        <div v-if="displayed.length > 0" class="qcl-bulk-header">
          <label class="qcl-bulk-select-all">
            <input
              type="checkbox"
              class="qcl-bulk-checkbox"
              :checked="bulk.allSelected.value"
              :indeterminate.prop="bulk.someSelected.value"
              aria-label="全選所有顯示中的 capture"
              @click="onHeaderCheckboxClick"
            />
            <span class="qcl-bulk-select-all-label">
              {{ bulk.allSelected.value ? '取消全選' : '全選' }}
            </span>
          </label>
          <span v-if="bulk.count.value > 0" class="qcl-bulk-count-hint">
            已選 {{ bulk.count.value }} / {{ displayed.length }}
          </span>
        </div>

        <!-- Bulk action bar (Teleported to body) -->
        <CaptureBulkActionBar
          :count="bulk.count.value"
          :has-archived="bulkHasArchived"
          @archive="bulkArchive"
          @unarchive="bulkUnarchive"
          @pin-toggle="bulkTogglePin"
          @delete="bulkDelete"
          @clear="bulk.clear()"
        />

        <!-- Body -->
        <div class="qcl-body">
          <!-- Empty state — no captures at all -->
          <p v-if="activeCaptures.length === 0 && archivedCaptures.length === 0" class="qcl-empty">
            尚未有 quick capture
          </p>

          <!-- Active captures section -->
          <template v-if="activeCaptures.length > 0 || (searchQuery || selectedTag)">
            <!-- Empty state — filter with no results (active list) -->
            <p v-if="activeCaptures.length > 0 && displayed.length === 0" class="qcl-empty">
              <template v-if="dateRange !== 'all' && !searchQuery && !selectedTag">此日期範圍無 capture</template>
              <template v-else-if="searchQuery && selectedTag">此篩選下無 capture</template>
              <template v-else-if="searchQuery">無符合搜尋的 capture</template>
              <template v-else>此 tag 下無 capture</template>
            </p>

            <!-- ── Flat mode (default) ──────────────────────────────── -->
            <ul v-if="displayed.length > 0 && viewMode === 'flat'" class="qcl-list" role="list">
              <li
                v-for="(capture, idx) in displayed"
                :key="capture.id"
                class="qcl-item"
                :class="{
                  'qcl-item--editing': editingId === capture.id,
                  'qcl-item--pinned': isPinned(capture.id),
                  'qcl-item--selected': bulk.isSelected(capture.id),
                  'qcl-item--keynav-highlight': highlightedIdx === idx,
                }"
              >
                <!-- Row checkbox -->
                <input
                  type="checkbox"
                  class="qcl-row-checkbox"
                  :checked="bulk.isSelected(capture.id)"
                  :aria-label="`選取：${capture.body.slice(0, 30)}`"
                  @click="(e) => onRowCheckboxClick(e as MouseEvent, capture.id)"
                />
                <div class="qcl-item-meta">
                  <span class="qcl-item-context">{{ capture.context }}</span>
                  <span class="qcl-item-time">{{ formatTime(capture.createdAt) }}</span>
                </div>

                <!-- Edit mode -->
                <div v-if="editingId === capture.id" class="qcl-edit">
                  <textarea
                    v-model="editingText"
                    class="qcl-edit-textarea"
                    rows="3"
                    autofocus
                    :aria-label="`編輯：${capture.body.slice(0, 30)}`"
                    @keydown.esc.stop="cancelEdit"
                    @keydown.enter.exact.meta="commitEdit(capture.id)"
                    @keydown.enter.exact.ctrl="commitEdit(capture.id)"
                  />
                  <div class="qcl-edit-actions">
                    <button class="qcl-save-btn" @click="commitEdit(capture.id)">儲存 (⌘+Enter)</button>
                    <button class="qcl-cancel-btn" @click="cancelEdit">取消 (Esc)</button>
                  </div>
                </div>

                <!-- Display mode -->
                <template v-else>
                  <p class="qcl-item-body">{{ capture.body }}</p>
                  <div class="qcl-item-actions">
                    <button
                      class="qcl-pin-btn"
                      :class="{ 'qcl-pin-btn--active': isPinned(capture.id) }"
                      :aria-label="isPinned(capture.id) ? `取消釘選：${capture.body.slice(0, 30)}` : `釘選：${capture.body.slice(0, 30)}`"
                      :title="isPinned(capture.id) ? '取消釘選' : '釘選'"
                      @click="handlePin(capture)"
                    >📌</button>
                    <button
                      class="qcl-clone-btn"
                      :aria-label="`複製為新 capture：${capture.body.slice(0, 30)}`"
                      title="複製為新 capture"
                      @click="handleClone(capture)"
                    >📋</button>
                    <button
                      class="qcl-copy-btn"
                      :disabled="!isClipboardWriteSupported()"
                      :aria-label="`複製為文字：${capture.body.slice(0, 30)}`"
                      title="複製為文字"
                      @click="handleCopy(capture)"
                    >🔗</button>
                    <button
                      class="qcl-edit-btn"
                      :aria-label="`編輯：${capture.body.slice(0, 30)}`"
                      @click="startEdit(capture)"
                    >✏️ 編輯</button>
                    <button
                      class="qcl-archive-btn"
                      :aria-label="`封存：${capture.body.slice(0, 30)}`"
                      @click="handleArchive(capture)"
                    >📦 封存</button>
                    <button
                      class="qcl-delete-btn"
                      :aria-label="`刪除：${capture.body.slice(0, 30)}`"
                      @click="handleDelete(capture)"
                    >✕ 刪除</button>
                  </div>
                </template>
              </li>
            </ul>

            <!-- ── Timeline mode ────────────────────────────────────────── -->
            <template v-if="displayed.length > 0 && viewMode === 'timeline'">
              <!-- Pinned items — single flat block at top (no date grouping) -->
              <div v-if="pinnedDisplayed.length > 0" class="qcl-timeline-pinned-block">
                <h3 class="qcl-timeline-group-header">📌 釘選 ({{ pinnedDisplayed.length }})</h3>
                <ul class="qcl-list" role="list">
                  <li
                    v-for="capture in pinnedDisplayed"
                    :key="capture.id"
                    class="qcl-item qcl-item--pinned"
                    :class="{
                      'qcl-item--editing': editingId === capture.id,
                      'qcl-item--selected': bulk.isSelected(capture.id),
                    }"
                  >
                    <!-- Row checkbox -->
                    <input
                      type="checkbox"
                      class="qcl-row-checkbox"
                      :checked="bulk.isSelected(capture.id)"
                      :aria-label="`選取：${capture.body.slice(0, 30)}`"
                      @click="(e) => onRowCheckboxClick(e as MouseEvent, capture.id)"
                    />
                    <div class="qcl-item-meta">
                      <span class="qcl-item-context">{{ capture.context }}</span>
                      <span class="qcl-item-time">{{ formatTime(capture.createdAt) }}</span>
                    </div>
                    <div v-if="editingId === capture.id" class="qcl-edit">
                      <textarea
                        v-model="editingText"
                        class="qcl-edit-textarea"
                        rows="3"
                        autofocus
                        :aria-label="`編輯：${capture.body.slice(0, 30)}`"
                        @keydown.esc.stop="cancelEdit"
                        @keydown.enter.exact.meta="commitEdit(capture.id)"
                        @keydown.enter.exact.ctrl="commitEdit(capture.id)"
                      />
                      <div class="qcl-edit-actions">
                        <button class="qcl-save-btn" @click="commitEdit(capture.id)">儲存 (⌘+Enter)</button>
                        <button class="qcl-cancel-btn" @click="cancelEdit">取消 (Esc)</button>
                      </div>
                    </div>
                    <template v-else>
                      <p class="qcl-item-body">{{ capture.body }}</p>
                      <div class="qcl-item-actions">
                        <button
                          class="qcl-pin-btn qcl-pin-btn--active"
                          :aria-label="`取消釘選：${capture.body.slice(0, 30)}`"
                          title="取消釘選"
                          @click="handlePin(capture)"
                        >📌</button>
                        <button class="qcl-clone-btn" :aria-label="`複製為新 capture：${capture.body.slice(0, 30)}`" title="複製為新 capture" @click="handleClone(capture)">📋</button>
                        <button class="qcl-copy-btn" :disabled="!isClipboardWriteSupported()" :aria-label="`複製為文字：${capture.body.slice(0, 30)}`" title="複製為文字" @click="handleCopy(capture)">🔗</button>
                        <button class="qcl-edit-btn" :aria-label="`編輯：${capture.body.slice(0, 30)}`" @click="startEdit(capture)">✏️ 編輯</button>
                        <button class="qcl-archive-btn" :aria-label="`封存：${capture.body.slice(0, 30)}`" @click="handleArchive(capture)">📦 封存</button>
                        <button class="qcl-delete-btn" :aria-label="`刪除：${capture.body.slice(0, 30)}`" @click="handleDelete(capture)">✕ 刪除</button>
                      </div>
                    </template>
                  </li>
                </ul>
              </div>

              <!-- Day-grouped sections for non-pinned captures -->
              <section
                v-for="group in groupedDisplay"
                :key="group.dateKey"
                class="qcl-timeline-group"
                :aria-label="`日期：${group.label}`"
              >
                <h3 class="qcl-timeline-group-header">
                  {{ group.label }}
                  <span class="qcl-timeline-group-count">({{ group.captures.length }})</span>
                </h3>
                <ul class="qcl-list" role="list">
                  <li
                    v-for="capture in group.captures"
                    :key="capture.id"
                    class="qcl-item"
                    :class="{
                      'qcl-item--editing': editingId === capture.id,
                      'qcl-item--selected': bulk.isSelected(capture.id),
                    }"
                  >
                    <!-- Row checkbox -->
                    <input
                      type="checkbox"
                      class="qcl-row-checkbox"
                      :checked="bulk.isSelected(capture.id)"
                      :aria-label="`選取：${capture.body.slice(0, 30)}`"
                      @click="(e) => onRowCheckboxClick(e as MouseEvent, capture.id)"
                    />
                    <div class="qcl-item-meta">
                      <span class="qcl-item-context">{{ capture.context }}</span>
                      <span class="qcl-item-time">{{ formatTime(capture.createdAt) }}</span>
                    </div>
                    <div v-if="editingId === capture.id" class="qcl-edit">
                      <textarea
                        v-model="editingText"
                        class="qcl-edit-textarea"
                        rows="3"
                        autofocus
                        :aria-label="`編輯：${capture.body.slice(0, 30)}`"
                        @keydown.esc.stop="cancelEdit"
                        @keydown.enter.exact.meta="commitEdit(capture.id)"
                        @keydown.enter.exact.ctrl="commitEdit(capture.id)"
                      />
                      <div class="qcl-edit-actions">
                        <button class="qcl-save-btn" @click="commitEdit(capture.id)">儲存 (⌘+Enter)</button>
                        <button class="qcl-cancel-btn" @click="cancelEdit">取消 (Esc)</button>
                      </div>
                    </div>
                    <template v-else>
                      <p class="qcl-item-body">{{ capture.body }}</p>
                      <div class="qcl-item-actions">
                        <button
                          class="qcl-pin-btn"
                          :aria-label="`釘選：${capture.body.slice(0, 30)}`"
                          title="釘選"
                          @click="handlePin(capture)"
                        >📌</button>
                        <button class="qcl-clone-btn" :aria-label="`複製為新 capture：${capture.body.slice(0, 30)}`" title="複製為新 capture" @click="handleClone(capture)">📋</button>
                        <button class="qcl-copy-btn" :disabled="!isClipboardWriteSupported()" :aria-label="`複製為文字：${capture.body.slice(0, 30)}`" title="複製為文字" @click="handleCopy(capture)">🔗</button>
                        <button class="qcl-edit-btn" :aria-label="`編輯：${capture.body.slice(0, 30)}`" @click="startEdit(capture)">✏️ 編輯</button>
                        <button class="qcl-archive-btn" :aria-label="`封存：${capture.body.slice(0, 30)}`" @click="handleArchive(capture)">📦 封存</button>
                        <button class="qcl-delete-btn" :aria-label="`刪除：${capture.body.slice(0, 30)}`" @click="handleDelete(capture)">✕ 刪除</button>
                      </div>
                    </template>
                  </li>
                </ul>
              </section>
            </template>
          </template>

          <!-- Archived section (shown when toggle is on) -->
          <template v-if="showArchived && archivedCaptures.length > 0">
            <div class="qcl-archived-section">
              <p class="qcl-section-label">📦 已封存</p>
              <p v-if="displayedArchived.length === 0" class="qcl-empty">
                <template v-if="searchQuery && selectedTag">此篩選下無封存 capture</template>
                <template v-else-if="searchQuery">無符合搜尋的封存 capture</template>
                <template v-else>此 tag 下無封存 capture</template>
              </p>
              <ul v-else class="qcl-list" role="list">
                <li
                  v-for="capture in displayedArchived"
                  :key="capture.id"
                  class="qcl-item qcl-item--archived"
                >
                  <div class="qcl-item-meta">
                    <span class="qcl-item-context">{{ capture.context }}</span>
                    <span class="qcl-item-time">{{ formatTime(capture.createdAt) }}</span>
                  </div>
                  <p class="qcl-item-body">{{ capture.body }}</p>
                  <div class="qcl-item-actions">
                    <button
                      class="qcl-unarchive-btn"
                      :aria-label="`還原：${capture.body.slice(0, 30)}`"
                      @click="handleUnarchive(capture)"
                    >還原</button>
                    <button
                      class="qcl-delete-btn"
                      :aria-label="`刪除：${capture.body.slice(0, 30)}`"
                      @click="handleDelete(capture)"
                    >✕ 刪除</button>
                  </div>
                </li>
              </ul>
            </div>
          </template>
        </div>

        <!-- Footer -->
        <div v-if="captures.length > 0" class="qcl-footer">
          <button class="qcl-clear-btn" @click="handleClearAll">
            🗑 清空全部
          </button>
        </div>

      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.qcl-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.qcl-dialog {
  background: var(--color-surface, #1e1e2e);
  color: var(--color-text, #cdd6f4);
  border: 1px solid var(--color-border, #313244);
  border-radius: 0.75rem;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  width: 100%;
  max-width: 560px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  outline: none;
}

/* ── Header ─────────────────────────────────────────────────────────────── */

.qcl-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem 0.75rem;
  border-bottom: 1px solid var(--color-border, #313244);
  flex-shrink: 0;
}

.qcl-title {
  font-size: 1rem;
  font-weight: 600;
  margin: 0;
  color: var(--color-text, #cdd6f4);
  display: flex;
  align-items: baseline;
  gap: 0.375rem;
}

.qcl-count {
  font-size: 0.8125rem;
  font-weight: 400;
  color: var(--color-muted, #6c7086);
}

.qcl-header-actions {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.qcl-download-btn {
  background: none;
  border: 1px solid var(--color-border, #313244);
  color: var(--color-muted, #6c7086);
  cursor: pointer;
  font-size: 0.75rem;
  line-height: 1.5;
  padding: 0.2rem 0.625rem;
  border-radius: 0.375rem;
  transition: color 0.15s, border-color 0.15s, background 0.15s;
  white-space: nowrap;
}

.qcl-download-btn:hover:not(:disabled) {
  color: var(--color-text, #cdd6f4);
  border-color: var(--color-accent, #89b4fa);
}

.qcl-download-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.qcl-close-btn {
  background: none;
  border: none;
  color: var(--color-muted, #6c7086);
  cursor: pointer;
  font-size: 1rem;
  line-height: 1;
  padding: 0.25rem 0.5rem;
  border-radius: 0.375rem;
  transition: color 0.15s, background 0.15s;
}

.qcl-close-btn:hover {
  color: var(--color-text, #cdd6f4);
  background: var(--color-surface-hover, #313244);
}

/* ── Body ────────────────────────────────────────────────────────────────── */

.qcl-body {
  overflow-y: auto;
  padding: 0.75rem 1.25rem;
  flex: 1;
}

.qcl-empty {
  text-align: center;
  color: var(--color-muted, #6c7086);
  font-size: 0.875rem;
  padding: 2rem 0;
  margin: 0;
}

.qcl-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
}

.qcl-item {
  background: var(--color-surface-raised, #181825);
  border: 1px solid var(--color-border, #313244);
  border-radius: 0.5rem;
  padding: 0.625rem 0.875rem;
  position: relative;
}

.qcl-item-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.25rem;
}

.qcl-item-context {
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--color-accent, #89b4fa);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.qcl-item-time {
  font-size: 0.7rem;
  color: var(--color-muted, #6c7086);
  white-space: nowrap;
}

.qcl-item-body {
  font-size: 0.875rem;
  line-height: 1.5;
  color: var(--color-text, #cdd6f4);
  margin: 0 0 0.375rem;
  white-space: pre-wrap;
  word-break: break-word;
}

.qcl-delete-btn {
  background: none;
  border: 1px solid var(--color-border, #313244);
  color: var(--color-muted, #6c7086);
  cursor: pointer;
  font-size: 0.7rem;
  padding: 0.15rem 0.5rem;
  border-radius: 0.25rem;
  transition: color 0.15s, border-color 0.15s;
  line-height: 1.5;
}

.qcl-delete-btn:hover {
  color: var(--red, #ef5f5f);
  border-color: var(--red, #ef5f5f);
}

/* ── Item actions row ───────────────────────────────────────────────────── */

.qcl-item-actions {
  display: flex;
  gap: 0.375rem;
  flex-wrap: wrap;
}

/* ── Edit button ────────────────────────────────────────────────────────── */

.qcl-edit-btn {
  background: none;
  border: 1px solid var(--color-border, #313244);
  color: var(--color-muted, #6c7086);
  cursor: pointer;
  font-size: 0.7rem;
  padding: 0.15rem 0.5rem;
  border-radius: 0.25rem;
  transition: color 0.15s, border-color 0.15s;
  line-height: 1.5;
}

.qcl-edit-btn:hover {
  color: var(--color-accent, #89b4fa);
  border-color: var(--color-accent, #89b4fa);
}

/* ── Editing state ──────────────────────────────────────────────────────── */

.qcl-item--editing {
  border-color: var(--color-accent, #89b4fa);
  background: var(--color-surface, #1e1e2e);
}

.qcl-edit {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  margin-top: 0.25rem;
}

.qcl-edit-textarea {
  background: var(--color-surface-raised, #181825);
  border: 1px solid var(--color-accent, #89b4fa);
  border-radius: 0.375rem;
  color: var(--color-text, #cdd6f4);
  font-size: 0.875rem;
  line-height: 1.5;
  padding: 0.375rem 0.5rem;
  outline: none;
  resize: vertical;
  width: 100%;
  font-family: inherit;
  box-sizing: border-box;
}

.qcl-edit-textarea:focus {
  border-color: var(--color-accent, #89b4fa);
  box-shadow: 0 0 0 2px rgba(137, 180, 250, 0.2);
}

.qcl-edit-actions {
  display: flex;
  gap: 0.375rem;
}

.qcl-save-btn {
  background: var(--color-accent, #89b4fa);
  border: 1px solid var(--color-accent, #89b4fa);
  color: var(--color-surface, #1e1e2e);
  cursor: pointer;
  font-size: 0.7rem;
  padding: 0.2rem 0.625rem;
  border-radius: 0.25rem;
  transition: opacity 0.15s;
  line-height: 1.5;
  font-weight: 600;
}

.qcl-save-btn:hover {
  opacity: 0.85;
}

.qcl-cancel-btn {
  background: none;
  border: 1px solid var(--color-border, #313244);
  color: var(--color-muted, #6c7086);
  cursor: pointer;
  font-size: 0.7rem;
  padding: 0.2rem 0.625rem;
  border-radius: 0.25rem;
  transition: color 0.15s, border-color 0.15s;
  line-height: 1.5;
}

.qcl-cancel-btn:hover {
  color: var(--color-text, #cdd6f4);
  border-color: var(--color-muted, #6c7086);
}

/* ── Heatmap row ────────────────────────────────────────────────────────── */

.qcl-heatmap-row {
  display: flex;
  align-items: center;
  padding: 0.5rem 1.25rem 0;
  flex-shrink: 0;
  overflow-x: auto;
}

/* ── Search bar ─────────────────────────────────────────────────────────── */

.qcl-search-bar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 1.25rem 0;
  flex-shrink: 0;
}

.qc-search {
  flex: 1;
  background: var(--color-surface-raised, #181825);
  border: 1px solid var(--color-border, #313244);
  border-radius: 0.375rem;
  color: var(--color-text, #cdd6f4);
  font-size: 0.8125rem;
  line-height: 1.5;
  padding: 0.3125rem 0.625rem;
  outline: none;
  transition: border-color 0.15s;
  width: 100%;
}

.qc-search::placeholder {
  color: var(--color-muted, #6c7086);
}

.qc-search:focus {
  border-color: var(--color-accent, #89b4fa);
}

.qc-date-range {
  background: var(--color-surface-raised, #181825);
  border: 1px solid var(--color-border, #313244);
  border-radius: 0.375rem;
  color: var(--color-text, #cdd6f4);
  font-size: 0.8125rem;
  line-height: 1.5;
  padding: 0.3125rem 0.5rem;
  outline: none;
  cursor: pointer;
  flex-shrink: 0;
  transition: border-color 0.15s;
}

.qc-date-range:focus {
  border-color: var(--color-accent, #89b4fa);
}

.qcl-filter-count {
  font-size: 0.7rem;
  color: var(--color-muted, #6c7086);
  white-space: nowrap;
  flex-shrink: 0;
}

/* ── Tag chips bar ──────────────────────────────────────────────────────── */

.qcl-tag-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  padding: 0.625rem 1.25rem 0;
  flex-shrink: 0;
}

.tag-chip {
  background: none;
  border: 1px solid var(--color-border, #313244);
  color: var(--color-muted, #6c7086);
  cursor: pointer;
  font-size: 0.7rem;
  padding: 0.1875rem 0.5rem;
  border-radius: 999px;
  transition: color 0.15s, border-color 0.15s, background 0.15s;
  line-height: 1.5;
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

.tag-chip:hover {
  color: var(--color-text, #cdd6f4);
  border-color: var(--color-accent, #89b4fa);
}

.tag-chip.is-active {
  background: var(--color-accent, #89b4fa);
  border-color: var(--color-accent, #89b4fa);
  color: var(--color-surface, #1e1e2e);
}

.tag-chip.is-active:hover {
  color: var(--color-surface, #1e1e2e);
}

.tag-chip--reset {
  border-style: dashed;
}

.tag-chip--reset:hover {
  color: var(--color-text, #cdd6f4);
  border-color: var(--color-muted, #6c7086);
}

.tag-chip__count {
  font-variant-numeric: tabular-nums;
  opacity: 0.75;
}

/* ── Footer ─────────────────────────────────────────────────────────────── */

.qcl-footer {
  padding: 0.625rem 1.25rem;
  border-top: 1px solid var(--color-border, #313244);
  flex-shrink: 0;
}

.qcl-clear-btn {
  background: none;
  border: 1px solid var(--color-border, #313244);
  color: var(--color-muted, #6c7086);
  cursor: pointer;
  font-size: 0.75rem;
  padding: 0.25rem 0.75rem;
  border-radius: 0.375rem;
  transition: color 0.15s, border-color 0.15s;
  line-height: 1.5;
}

.qcl-clear-btn:hover {
  color: var(--red, #ef5f5f);
  border-color: var(--red, #ef5f5f);
}

/* ── Archive toolbar ────────────────────────────────────────────────────── */

.qcl-archive-toolbar {
  display: flex;
  align-items: center;
  padding: 0.375rem 1.25rem 0;
  flex-shrink: 0;
}

.qcl-archive-toggle-btn {
  background: none;
  border: 1px dashed var(--color-border, #313244);
  color: var(--color-muted, #6c7086);
  cursor: pointer;
  font-size: 0.75rem;
  padding: 0.2rem 0.625rem;
  border-radius: 0.375rem;
  transition: color 0.15s, border-color 0.15s;
  line-height: 1.5;
}

.qcl-archive-toggle-btn:hover {
  color: var(--color-text, #cdd6f4);
  border-color: var(--color-muted, #6c7086);
}

/* ── Pin button ─────────────────────────────────────────────────────────── */

.qcl-pin-btn {
  background: none;
  border: 1px solid var(--color-border, #313244);
  color: var(--color-muted, #6c7086);
  cursor: pointer;
  font-size: 0.7rem;
  padding: 0.15rem 0.5rem;
  border-radius: 0.25rem;
  transition: color 0.15s, border-color 0.15s, background 0.15s;
  line-height: 1.5;
  opacity: 0.5;
}

.qcl-pin-btn:hover {
  opacity: 1;
  border-color: var(--color-accent, #89b4fa);
}

.qcl-pin-btn--active {
  opacity: 1;
  border-color: var(--color-accent, #89b4fa);
  background: rgba(137, 180, 250, 0.1);
}

/* Pinned items have a subtle left-border accent */
.qcl-item--pinned {
  border-left: 3px solid var(--color-accent, #89b4fa);
}

/* ── Clone button ───────────────────────────────────────────────────────── */

.qcl-clone-btn {
  background: none;
  border: 1px solid var(--color-border, #313244);
  color: var(--color-muted, #6c7086);
  cursor: pointer;
  font-size: 0.7rem;
  padding: 0.15rem 0.5rem;
  border-radius: 0.25rem;
  transition: color 0.15s, border-color 0.15s;
  line-height: 1.5;
}

.qcl-clone-btn:hover {
  color: var(--color-accent, #89b4fa);
  border-color: var(--color-accent, #89b4fa);
}

/* ── Copy-to-clipboard button ───────────────────────────────────────────── */

.qcl-copy-btn {
  background: none;
  border: 1px solid var(--color-border, #313244);
  color: var(--color-muted, #6c7086);
  cursor: pointer;
  font-size: 0.7rem;
  padding: 0.15rem 0.5rem;
  border-radius: 0.25rem;
  transition: color 0.15s, border-color 0.15s;
  line-height: 1.5;
}

.qcl-copy-btn:hover:not(:disabled) {
  color: var(--color-accent, #89b4fa);
  border-color: var(--color-accent, #89b4fa);
}

.qcl-copy-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

/* ── Archive button ─────────────────────────────────────────────────────── */

.qcl-archive-btn {
  background: none;
  border: 1px solid var(--color-border, #313244);
  color: var(--color-muted, #6c7086);
  cursor: pointer;
  font-size: 0.7rem;
  padding: 0.15rem 0.5rem;
  border-radius: 0.25rem;
  transition: color 0.15s, border-color 0.15s;
  line-height: 1.5;
}

.qcl-archive-btn:hover {
  color: var(--color-accent, #89b4fa);
  border-color: var(--color-accent, #89b4fa);
}

/* ── Archived section ───────────────────────────────────────────────────── */

.qcl-archived-section {
  margin-top: 0.75rem;
  border-top: 1px dashed var(--color-border, #313244);
  padding-top: 0.625rem;
}

.qcl-section-label {
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--color-muted, #6c7086);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin: 0 0 0.5rem;
}

/* Archived items are visually de-emphasized */
.qcl-item--archived {
  opacity: 0.7;
}

/* ── Unarchive (restore) button ─────────────────────────────────────────── */

.qcl-unarchive-btn {
  background: none;
  border: 1px solid var(--color-border, #313244);
  color: var(--color-muted, #6c7086);
  cursor: pointer;
  font-size: 0.7rem;
  padding: 0.15rem 0.5rem;
  border-radius: 0.25rem;
  transition: color 0.15s, border-color 0.15s;
  line-height: 1.5;
}

.qcl-unarchive-btn:hover {
  color: var(--green, #a6e3a1);
  border-color: var(--green, #a6e3a1);
}

/* ── Sort toggle button ─────────────────────────────────────────────────── */

.qc-sort-btn {
  background: none;
  border: 1px solid var(--color-border, #313244);
  color: var(--color-muted, #6c7086);
  cursor: pointer;
  font-size: 0.75rem;
  line-height: 1.5;
  padding: 0.3125rem 0.625rem;
  border-radius: 0.375rem;
  transition: color 0.15s, border-color 0.15s;
  white-space: nowrap;
  flex-shrink: 0;
}

.qc-sort-btn:hover {
  color: var(--color-text, #cdd6f4);
  border-color: var(--color-accent, #89b4fa);
}

/* ── View mode toggle button ────────────────────────────────────────────── */

.qc-view-mode-btn {
  background: none;
  border: 1px solid var(--color-border, #313244);
  color: var(--color-muted, #6c7086);
  cursor: pointer;
  font-size: 0.75rem;
  line-height: 1.5;
  padding: 0.3125rem 0.625rem;
  border-radius: 0.375rem;
  transition: color 0.15s, border-color 0.15s, background 0.15s;
  white-space: nowrap;
  flex-shrink: 0;
}

.qc-view-mode-btn:hover {
  color: var(--color-text, #cdd6f4);
  border-color: var(--color-accent, #89b4fa);
}

.qc-view-mode-btn--active {
  color: var(--color-accent, #89b4fa);
  border-color: var(--color-accent, #89b4fa);
  background: rgba(137, 180, 250, 0.08);
}

/* ── Timeline group headers ─────────────────────────────────────────────── */

.qcl-timeline-group {
  margin-top: 0.75rem;
}

.qcl-timeline-group:first-of-type {
  margin-top: 0;
}

.qcl-timeline-group-header {
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--color-muted, #6c7086);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin: 0 0 0.5rem;
  display: flex;
  align-items: baseline;
  gap: 0.25rem;
}

.qcl-timeline-group-count {
  font-variant-numeric: tabular-nums;
  font-weight: 400;
  opacity: 0.75;
}

.qcl-timeline-pinned-block {
  margin-bottom: 0.75rem;
  padding-bottom: 0.625rem;
  border-bottom: 1px dashed var(--color-border, #313244);
}

/* ── Bulk select header row ─────────────────────────────────────────────── */

.qcl-bulk-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.375rem 1.25rem 0;
  flex-shrink: 0;
}

.qcl-bulk-select-all {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  cursor: pointer;
  font-size: 0.75rem;
  color: var(--color-muted, #6c7086);
  user-select: none;
}

.qcl-bulk-select-all:hover {
  color: var(--color-text, #cdd6f4);
}

.qcl-bulk-checkbox {
  cursor: pointer;
  accent-color: var(--color-accent, #89b4fa);
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.qcl-bulk-select-all-label {
  font-size: 0.75rem;
}

.qcl-bulk-count-hint {
  font-size: 0.7rem;
  color: var(--color-accent, #89b4fa);
  font-weight: 600;
}

/* ── Per-row checkbox ───────────────────────────────────────────────────── */

.qcl-row-checkbox {
  position: absolute;
  top: 0.625rem;
  right: 0.875rem;
  cursor: pointer;
  accent-color: var(--color-accent, #89b4fa);
  width: 14px;
  height: 14px;
  opacity: 0.4;
  transition: opacity 0.12s;
}

.qcl-item:hover .qcl-row-checkbox,
.qcl-item--selected .qcl-row-checkbox {
  opacity: 1;
}

/* Selected item highlight */
.qcl-item--selected {
  border-color: var(--color-accent, #89b4fa);
  background: rgba(137, 180, 250, 0.06);
}

/* ── Keyboard navigation highlight ─────────────────────────────────────── */

/* Static outline only — no animation (respects prefers-reduced-motion) */
.qcl-item--keynav-highlight {
  outline: 2px solid var(--color-accent, #89b4fa);
  outline-offset: -2px;
}

/* ── Reduced motion ─────────────────────────────────────────────────────── */

@media (prefers-reduced-motion: reduce) {
  .qcl-overlay,
  .qcl-dialog,
  .qcl-close-btn,
  .qcl-download-btn,
  .qcl-delete-btn,
  .qcl-edit-btn,
  .qcl-clone-btn,
  .qcl-copy-btn,
  .qcl-pin-btn,
  .qcl-archive-btn,
  .qcl-archive-toggle-btn,
  .qcl-unarchive-btn,
  .qcl-save-btn,
  .qcl-cancel-btn,
  .qcl-edit-textarea,
  .qcl-clear-btn,
  .tag-chip,
  .qc-search,
  .qc-date-range,
  .qc-sort-btn,
  .qc-view-mode-btn,
  .qcl-row-checkbox,
  .qcl-bulk-select-all {
    transition: none;
    animation: none;
  }
}
</style>
