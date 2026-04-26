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
import { watch, nextTick, onUnmounted, ref, computed } from 'vue'
import { useQuickCapture } from '@/composables/useQuickCapture'
import { createFocusTrap } from '@/lib/focusTrap'
import { tagCounts, captureHasTag } from '@/utils/quickCaptureTags'
import { buildExport } from '@/utils/quickCaptureExport'
import { useToast } from '@/composables/useToast'
import { fuzzyScore } from '@/utils/fuzzyScore'
import type { Capture } from '@/utils/quickCapture'
import CaptureHeatmap from './CaptureHeatmap.vue'

const { isListOpen, captures, activeCaptures, archivedCaptures, closeList, remove, archive, unarchive, clear, update } = useQuickCapture()

// Inline edit state
const editingId = ref<string | null>(null)
const editingText = ref<string>('')

// Tag filtering
const selectedTag = ref<string | null>(null)

// Search
const searchQuery = ref('')

// Archive section visibility
const showArchived = ref(false)

const tags = computed(() => tagCounts(captures.value))

function applyFilters(list: Capture[]): Capture[] {
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

const displayed = computed(() => applyFilters([...activeCaptures.value]))

const displayedArchived = computed(() => applyFilters([...archivedCaptures.value]))

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
})

function handleClose(): void {
  closeList()
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
        @keydown.esc.stop="handleClose"
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

        <!-- Search input -->
        <div class="qcl-search-bar">
          <input
            v-model="searchQuery"
            type="text"
            class="qc-search"
            placeholder="搜尋 captures..."
            aria-label="搜尋 captures"
          />
          <span v-if="searchQuery || selectedTag" class="qcl-filter-count">
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
              <template v-if="searchQuery && selectedTag">此篩選下無 capture</template>
              <template v-else-if="searchQuery">無符合搜尋的 capture</template>
              <template v-else>此 tag 下無 capture</template>
            </p>

            <!-- Active capture list -->
            <ul v-if="displayed.length > 0" class="qcl-list" role="list">
              <li
                v-for="capture in displayed"
                :key="capture.id"
                class="qcl-item"
                :class="{ 'qcl-item--editing': editingId === capture.id }"
              >
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

/* ── Reduced motion ─────────────────────────────────────────────────────── */

@media (prefers-reduced-motion: reduce) {
  .qcl-overlay,
  .qcl-dialog,
  .qcl-close-btn,
  .qcl-download-btn,
  .qcl-delete-btn,
  .qcl-edit-btn,
  .qcl-archive-btn,
  .qcl-archive-toggle-btn,
  .qcl-unarchive-btn,
  .qcl-save-btn,
  .qcl-cancel-btn,
  .qcl-edit-textarea,
  .qcl-clear-btn,
  .tag-chip,
  .qc-search {
    transition: none;
    animation: none;
  }
}
</style>
