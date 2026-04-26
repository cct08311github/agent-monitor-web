<script setup lang="ts">
/**
 * SettingsBackupMenu — export, import, and reset all oc_* localStorage settings.
 *
 * Three sections:
 * 1. 匯出 — download a JSON backup of current oc_* settings.
 * 2. 匯入 — upload a JSON backup file and restore settings.
 * 3. 重設 — clear all oc_* settings and reload.
 *
 * State is driven by the shared useSettingsBackupMenu composable;
 * mount this component once in App.vue.
 */
import { ref, watch, nextTick, onUnmounted } from 'vue'
import { useSettingsBackupMenu } from '@/composables/useSettingsBackupMenu'
import { useToast } from '@/composables/useToast'
import {
  exportAsJson,
  parseBackup,
  restoreSettings,
  clearAllSettings,
} from '@/utils/settingsBackup'
import { createFocusTrap } from '@/lib/focusTrap'

const { isOpen, close } = useSettingsBackupMenu()
const toast = useToast()

// ---------------------------------------------------------------------------
// Focus trap
// ---------------------------------------------------------------------------

const dialogRef = ref<HTMLDivElement | null>(null)
const trap = createFocusTrap()

watch(isOpen, async (visible) => {
  if (visible) {
    await nextTick()
    if (dialogRef.value) {
      trap.activate(dialogRef.value, () => close())
    }
  } else {
    trap.deactivate()
  }
})

onUnmounted(() => {
  trap.deactivate()
})

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

function handleExport(): void {
  const { filename, content } = exportAsJson()
  const blob = new Blob([content], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  toast.success('已匯出設定備份')
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

const fileInput = ref<HTMLInputElement | null>(null)
const importing = ref(false)

function triggerFileInput(): void {
  fileInput.value?.click()
}

function onFileSelected(event: Event): void {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  importing.value = true
  const reader = new FileReader()
  reader.onload = (e) => {
    importing.value = false
    const text = e.target?.result
    if (typeof text !== 'string') {
      toast.error('無法讀取檔案')
      return
    }
    const backup = parseBackup(text)
    if (!backup) {
      toast.error('無效的備份檔案，請確認格式正確')
      input.value = ''
      return
    }
    const confirmed = window.confirm('將覆蓋目前所有設定，是否繼續？')
    if (!confirmed) {
      input.value = ''
      return
    }
    const count = restoreSettings(backup)
    input.value = ''
    close()
    toast.info(`已還原 ${count} 筆設定，重新整理頁面...`)
    setTimeout(() => window.location.reload(), 1200)
  }
  reader.onerror = () => {
    importing.value = false
    toast.error('讀取檔案失敗')
    input.value = ''
  }
  reader.readAsText(file)
}

// ---------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------

function handleReset(): void {
  const confirmed = window.confirm(
    '確定要清除所有設定嗎？\n\n這將移除所有 oc_* 前綴的 localStorage 設定，且無法復原。',
  )
  if (!confirmed) return

  const count = clearAllSettings()
  close()
  toast.info(`已清除 ${count} 筆設定，重新整理頁面...`)
  setTimeout(() => window.location.reload(), 1200)
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="isOpen"
      class="sbm-overlay"
      @click.self="close"
    >
      <div
        ref="dialogRef"
        class="sbm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sbm-title"
        tabindex="-1"
        @keydown.esc.stop="close"
      >
        <!-- Header -->
        <div class="sbm-header">
          <h2 id="sbm-title" class="sbm-title">💾 設定備份與還原</h2>
          <button
            class="sbm-close-btn"
            aria-label="關閉設定備份面板"
            @click="close"
          >✕</button>
        </div>

        <!-- Body -->
        <div class="sbm-body">
          <!-- Export section -->
          <section class="sbm-section">
            <h3 class="sbm-section-title">📤 匯出</h3>
            <p class="sbm-section-desc">
              將目前所有 <code class="sbm-code">oc_*</code> 設定下載為 JSON 檔，可用於備份或遷移到其他瀏覽器。
            </p>
            <button class="sbm-btn sbm-btn--primary" @click="handleExport">
              下載備份檔
            </button>
          </section>

          <hr class="sbm-divider" />

          <!-- Import section -->
          <section class="sbm-section">
            <h3 class="sbm-section-title">📥 匯入</h3>
            <p class="sbm-section-desc">
              選擇先前匯出的備份 JSON 檔，還原設定後頁面將自動重新整理。
            </p>
            <input
              ref="fileInput"
              type="file"
              accept=".json,application/json"
              class="sbm-file-input"
              aria-label="選擇備份 JSON 檔"
              @change="onFileSelected"
            />
            <button
              class="sbm-btn sbm-btn--secondary"
              :disabled="importing"
              @click="triggerFileInput"
            >
              {{ importing ? '讀取中…' : '選擇備份檔案' }}
            </button>
          </section>

          <hr class="sbm-divider" />

          <!-- Reset section -->
          <section class="sbm-section">
            <h3 class="sbm-section-title sbm-section-title--danger">🗑️ 重設</h3>
            <p class="sbm-section-desc">
              清除所有 <code class="sbm-code">oc_*</code> 設定（不影響其他 localStorage 資料）。操作不可復原，執行後頁面將重新整理。
            </p>
            <button class="sbm-btn sbm-btn--danger" @click="handleReset">
              清除所有設定
            </button>
          </section>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.sbm-overlay {
  position: fixed;
  inset: 0;
  z-index: 1150;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.sbm-dialog {
  background: var(--color-surface, #1e1e2e);
  color: var(--color-text, #cdd6f4);
  border: 1px solid var(--color-border, #313244);
  border-radius: 0.75rem;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  width: 100%;
  max-width: 480px;
  max-height: 82vh;
  display: flex;
  flex-direction: column;
  outline: none;
  overflow: hidden;
}

/* ── Header ─────────────────────────────────────────────────────────────── */

.sbm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem 0.75rem;
  border-bottom: 1px solid var(--color-border, #313244);
  flex-shrink: 0;
}

.sbm-title {
  font-size: 1rem;
  font-weight: 600;
  margin: 0;
  color: var(--color-text, #cdd6f4);
}

.sbm-close-btn {
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

.sbm-close-btn:hover {
  color: var(--color-text, #cdd6f4);
  background: var(--color-surface-hover, #313244);
}

/* ── Body ───────────────────────────────────────────────────────────────── */

.sbm-body {
  overflow-y: auto;
  padding: 1.25rem;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.sbm-section {
  padding: 0.25rem 0 0.5rem;
}

.sbm-section-title {
  font-size: 0.875rem;
  font-weight: 600;
  margin: 0 0 0.4rem;
  color: var(--color-accent, #89b4fa);
}

.sbm-section-title--danger {
  color: var(--color-error, #f38ba8);
}

.sbm-section-desc {
  font-size: 0.8125rem;
  color: var(--color-muted, #6c7086);
  margin: 0 0 0.75rem;
  line-height: 1.5;
}

.sbm-code {
  font-family: ui-monospace, 'SFMono-Regular', Menlo, monospace;
  font-size: 0.8em;
  background: var(--color-surface-raised, #181825);
  border: 1px solid var(--color-border, #313244);
  border-radius: 3px;
  padding: 1px 4px;
}

.sbm-divider {
  border: none;
  border-top: 1px solid var(--color-border, #313244);
  margin: 0.75rem 0;
}

/* Hidden file input — triggered programmatically */
.sbm-file-input {
  display: none;
}

/* ── Buttons ────────────────────────────────────────────────────────────── */

.sbm-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.8125rem;
  font-weight: 500;
  padding: 0.375rem 0.875rem;
  border-radius: 0.375rem;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s, opacity 0.15s;
  line-height: 1.5;
  border: 1px solid transparent;
}

.sbm-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.sbm-btn--primary {
  background: var(--color-accent, #89b4fa);
  color: var(--color-surface, #1e1e2e);
  border-color: var(--color-accent, #89b4fa);
}

.sbm-btn--primary:hover:not(:disabled) {
  opacity: 0.85;
}

.sbm-btn--secondary {
  background: none;
  border-color: var(--color-border, #313244);
  color: var(--color-muted, #6c7086);
}

.sbm-btn--secondary:hover:not(:disabled) {
  color: var(--color-text, #cdd6f4);
  border-color: var(--color-text, #cdd6f4);
}

.sbm-btn--danger {
  background: none;
  border-color: var(--color-error, #f38ba8);
  color: var(--color-error, #f38ba8);
}

.sbm-btn--danger:hover:not(:disabled) {
  background: var(--color-error, #f38ba8);
  color: var(--color-surface, #1e1e2e);
}

/* ── Reduced motion ─────────────────────────────────────────────────────── */

@media (prefers-reduced-motion: reduce) {
  .sbm-overlay,
  .sbm-dialog,
  .sbm-btn {
    transition: none;
    animation: none;
  }
}
</style>
