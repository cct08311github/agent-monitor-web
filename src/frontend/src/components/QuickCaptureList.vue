<script setup lang="ts">
/**
 * QuickCaptureList — lists all saved quick captures.
 *
 * Opens from the KeyboardShortcutsHelp footer button.
 * Supports per-item delete (with confirm) and "clear all" (with confirm).
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
import type { Capture } from '@/utils/quickCapture'

const { isListOpen, captures, closeList, remove, clear } = useQuickCapture()

// Tag filtering
const selectedTag = ref<string | null>(null)

const tags = computed(() => tagCounts(captures.value))

const displayed = computed(() =>
  selectedTag.value
    ? captures.value.filter((c) => captureHasTag(c, selectedTag.value!))
    : captures.value,
)

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

function handleDelete(c: Capture): void {
  if (window.confirm(`刪除此 capture？\n\n「${c.body.slice(0, 60)}${c.body.length > 60 ? '…' : ''}」`)) {
    remove(c.id)
  }
}

function handleClearAll(): void {
  if (window.confirm(`確認清空所有 ${captures.value.length} 筆 quick capture？`)) {
    clear()
  }
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
            <span class="qcl-count">({{ captures.length }})</span>
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
          <p v-if="captures.length === 0" class="qcl-empty">
            尚未有 quick capture
          </p>

          <!-- Empty state — tag filter with no results -->
          <p v-else-if="displayed.length === 0" class="qcl-empty">
            此 tag 下無 capture
          </p>

          <!-- Capture list -->
          <ul v-else class="qcl-list" role="list">
            <li
              v-for="capture in displayed"
              :key="capture.id"
              class="qcl-item"
            >
              <div class="qcl-item-meta">
                <span class="qcl-item-context">{{ capture.context }}</span>
                <span class="qcl-item-time">{{ formatTime(capture.createdAt) }}</span>
              </div>
              <p class="qcl-item-body">{{ capture.body }}</p>
              <button
                class="qcl-delete-btn"
                :aria-label="`刪除：${capture.body.slice(0, 30)}`"
                @click="handleDelete(capture)"
              >✕ 刪除</button>
            </li>
          </ul>
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

/* ── Reduced motion ─────────────────────────────────────────────────────── */

@media (prefers-reduced-motion: reduce) {
  .qcl-overlay,
  .qcl-dialog,
  .qcl-close-btn,
  .qcl-download-btn,
  .qcl-delete-btn,
  .qcl-clear-btn,
  .tag-chip {
    transition: none;
    animation: none;
  }
}
</style>
