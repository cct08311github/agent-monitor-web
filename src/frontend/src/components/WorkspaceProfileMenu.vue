<script setup lang="ts">
/**
 * WorkspaceProfileMenu — modal for managing named workspace profiles.
 *
 * Each profile bundles theme, color palette, timezone, and sound settings
 * into a named snapshot that can be applied in one click.
 *
 * Mount once in App.vue; visibility controlled via useWorkspaceMenu().
 * Opens from KeyboardShortcutsHelp footer "📦 工作區" button.
 */
import { ref, watch, nextTick, onUnmounted } from 'vue'
import { useWorkspaceMenu } from '@/composables/useWorkspaceMenu'
import { useWorkspaceProfiles } from '@/composables/useWorkspaceProfiles'
import { useToast } from '@/composables/useToast'
import { createFocusTrap } from '@/lib/focusTrap'
import type { WorkspaceProfile } from '@/utils/workspaceProfiles'

const { isOpen, close } = useWorkspaceMenu()
const { profiles, activeId, add, apply, remove } = useWorkspaceProfiles()
const toast = useToast()

// ---------------------------------------------------------------------------
// Inline name-entry state
// ---------------------------------------------------------------------------

const showAddForm = ref(false)
const newProfileName = ref('')
const addInputRef = ref<HTMLInputElement | null>(null)

function openAddForm(): void {
  showAddForm.value = true
  newProfileName.value = ''
  nextTick(() => {
    addInputRef.value?.focus()
  })
}

function cancelAddForm(): void {
  showAddForm.value = false
  newProfileName.value = ''
}

function confirmAdd(): void {
  const name = newProfileName.value.trim() || `設定檔 ${profiles.value.length + 1}`
  const p = add(name)
  toast.success(`已儲存設定檔: ${p.name}`)
  showAddForm.value = false
  newProfileName.value = ''
}

function handleAddKeydown(e: KeyboardEvent): void {
  if (e.key === 'Enter') {
    e.preventDefault()
    confirmAdd()
  } else if (e.key === 'Escape') {
    e.stopPropagation()
    cancelAddForm()
  }
}

// ---------------------------------------------------------------------------
// Apply / Remove
// ---------------------------------------------------------------------------

function handleApply(p: WorkspaceProfile): void {
  apply(p)
  toast.success(`已套用: ${p.name}`)
  close()
}

function handleRemove(p: WorkspaceProfile): void {
  if (!window.confirm(`確定要刪除設定檔「${p.name}」？`)) return
  remove(p.id)
  toast.info(`已刪除: ${p.name}`)
}

// ---------------------------------------------------------------------------
// Theme/palette label helpers
// ---------------------------------------------------------------------------

const THEME_LABELS: Record<string, string> = {
  light: '☀️ Light',
  dark: '🌙 Dark',
  auto: '🌓 Auto',
  neon: '⚡ Neon',
  retro: '📟 Retro',
}

const PALETTE_LABELS: Record<string, string> = {
  default: '預設色盤',
  'cb-safe': '色盲友善',
}

function profileSummary(p: WorkspaceProfile): string {
  const theme = THEME_LABELS[p.themeMode] ?? p.themeMode
  const palette = PALETTE_LABELS[p.palette] ?? p.palette
  const tz = p.timezoneMode === 'utc' ? 'UTC' : '本地時間'
  const sound = p.soundEnabled ? '音效開' : '音效關'
  return `${theme} · ${palette} · ${tz} · ${sound}`
}

// ---------------------------------------------------------------------------
// Focus trap
// ---------------------------------------------------------------------------

const dialogRef = ref<HTMLDivElement | null>(null)
const trap = createFocusTrap()

watch(isOpen, async (visible) => {
  if (visible) {
    showAddForm.value = false
    newProfileName.value = ''
    await nextTick()
    if (dialogRef.value) {
      trap.activate(dialogRef.value, () => close())
    }
    dialogRef.value?.focus()
  } else {
    trap.deactivate()
  }
})

onUnmounted(() => {
  trap.deactivate()
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="isOpen"
      class="wpm-overlay"
      @click.self="close"
    >
      <div
        ref="dialogRef"
        class="wpm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wpm-title"
        tabindex="-1"
        @keydown.esc.stop="close"
      >
        <!-- Header -->
        <div class="wpm-header">
          <h2 id="wpm-title" class="wpm-title">📦 工作區設定檔</h2>
          <button
            class="wpm-close-btn"
            aria-label="關閉工作區設定檔"
            @click="close"
          >✕</button>
        </div>

        <!-- Body -->
        <div class="wpm-body">
          <!-- Empty state -->
          <p v-if="profiles.length === 0" class="wpm-empty">
            尚未建立工作區設定檔。點選「+ 從目前設定新增」儲存當下的個人化組合。
          </p>

          <!-- Profile list -->
          <ul v-else class="wpm-list" role="list">
            <li
              v-for="p in profiles"
              :key="p.id"
              class="wpm-item"
              :class="{ 'wpm-item--active': activeId === p.id }"
            >
              <div class="wpm-item-info">
                <span class="wpm-item-name">
                  <span v-if="activeId === p.id" class="wpm-active-mark" aria-label="目前套用">✓</span>
                  {{ p.name }}
                </span>
                <span class="wpm-item-summary">{{ profileSummary(p) }}</span>
              </div>
              <div class="wpm-item-actions">
                <button
                  class="wpm-btn wpm-btn--apply"
                  :aria-label="`套用設定檔 ${p.name}`"
                  @click="handleApply(p)"
                >套用</button>
                <button
                  class="wpm-btn wpm-btn--remove"
                  :disabled="activeId === p.id"
                  :title="activeId === p.id ? '無法刪除目前套用中的設定檔' : `刪除設定檔 ${p.name}`"
                  :aria-label="`刪除設定檔 ${p.name}`"
                  @click="handleRemove(p)"
                >✕</button>
              </div>
            </li>
          </ul>
        </div>

        <!-- Footer: add form or add button -->
        <div class="wpm-footer">
          <div v-if="showAddForm" class="wpm-add-form">
            <input
              ref="addInputRef"
              v-model="newProfileName"
              class="wpm-add-input"
              type="text"
              placeholder="設定檔名稱（留空自動命名）"
              maxlength="60"
              aria-label="新設定檔名稱"
              @keydown="handleAddKeydown"
            />
            <div class="wpm-add-form-btns">
              <button class="wpm-btn wpm-btn--confirm" @click="confirmAdd">儲存</button>
              <button class="wpm-btn wpm-btn--cancel" @click="cancelAddForm">取消</button>
            </div>
          </div>
          <button
            v-else
            class="wpm-add-btn"
            @click="openAddForm"
          >+ 從目前設定新增</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.wpm-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.wpm-dialog {
  background: var(--color-surface, #1e1e2e);
  color: var(--color-text, #cdd6f4);
  border: 1px solid var(--color-border, #313244);
  border-radius: 0.75rem;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  width: 100%;
  max-width: 480px;
  max-height: 75vh;
  display: flex;
  flex-direction: column;
  outline: none;
}

/* ── Header ─────────────────────────────────────────────────────────────── */

.wpm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem 0.75rem;
  border-bottom: 1px solid var(--color-border, #313244);
  flex-shrink: 0;
}

.wpm-title {
  font-size: 1rem;
  font-weight: 600;
  margin: 0;
  color: var(--color-text, #cdd6f4);
}

.wpm-close-btn {
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

.wpm-close-btn:hover {
  color: var(--color-text, #cdd6f4);
  background: var(--color-surface-hover, #313244);
}

/* ── Body ────────────────────────────────────────────────────────────────── */

.wpm-body {
  overflow-y: auto;
  padding: 0.75rem 1.25rem;
  flex: 1;
}

.wpm-empty {
  font-size: 0.875rem;
  color: var(--color-muted, #6c7086);
  text-align: center;
  padding: 1.5rem 0;
  margin: 0;
}

.wpm-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.wpm-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.625rem 0.75rem;
  border: 1px solid var(--color-border, #313244);
  border-radius: 0.5rem;
  transition: border-color 0.15s, background 0.15s;
}

.wpm-item:hover {
  background: var(--color-surface-hover, #313244);
}

.wpm-item--active {
  border-color: var(--color-accent, #89b4fa);
}

.wpm-item-info {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  min-width: 0;
  flex: 1;
}

.wpm-item-name {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-text, #cdd6f4);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.wpm-active-mark {
  color: var(--color-accent, #89b4fa);
  margin-right: 0.25rem;
  font-size: 0.75rem;
}

.wpm-item-summary {
  font-size: 0.7rem;
  color: var(--color-muted, #6c7086);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.wpm-item-actions {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  flex-shrink: 0;
}

/* ── Buttons ─────────────────────────────────────────────────────────────── */

.wpm-btn {
  background: none;
  border: 1px solid var(--color-border, #313244);
  color: var(--color-muted, #6c7086);
  cursor: pointer;
  font-size: 0.75rem;
  padding: 0.2rem 0.6rem;
  border-radius: 0.375rem;
  transition: color 0.15s, border-color 0.15s, background 0.15s;
  line-height: 1.5;
}

.wpm-btn:hover:not(:disabled) {
  color: var(--color-text, #cdd6f4);
  border-color: var(--color-text, #cdd6f4);
}

.wpm-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.wpm-btn--apply {
  color: var(--color-accent, #89b4fa);
  border-color: var(--color-accent, #89b4fa);
}

.wpm-btn--apply:hover:not(:disabled) {
  background: color-mix(in srgb, var(--color-accent, #89b4fa) 15%, transparent);
  color: var(--color-accent, #89b4fa);
  border-color: var(--color-accent, #89b4fa);
}

.wpm-btn--remove:hover:not(:disabled) {
  color: var(--red, #ef5f5f);
  border-color: var(--red, #ef5f5f);
}

.wpm-btn--confirm {
  color: var(--color-accent, #89b4fa);
  border-color: var(--color-accent, #89b4fa);
}

.wpm-btn--confirm:hover:not(:disabled) {
  background: color-mix(in srgb, var(--color-accent, #89b4fa) 15%, transparent);
}

/* ── Footer ─────────────────────────────────────────────────────────────── */

.wpm-footer {
  padding: 0.75rem 1.25rem;
  border-top: 1px solid var(--color-border, #313244);
  flex-shrink: 0;
}

.wpm-add-btn {
  background: none;
  border: 1px dashed var(--color-border, #313244);
  color: var(--color-muted, #6c7086);
  cursor: pointer;
  font-size: 0.8125rem;
  padding: 0.375rem 0.75rem;
  border-radius: 0.375rem;
  width: 100%;
  text-align: left;
  transition: color 0.15s, border-color 0.15s, background 0.15s;
  line-height: 1.5;
}

.wpm-add-btn:hover {
  color: var(--color-text, #cdd6f4);
  border-color: var(--color-text, #cdd6f4);
  background: var(--color-surface-hover, #313244);
}

.wpm-add-form {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.wpm-add-input {
  width: 100%;
  box-sizing: border-box;
  background: var(--color-surface-raised, #181825);
  border: 1px solid var(--color-border, #313244);
  border-radius: 0.375rem;
  color: var(--color-text, #cdd6f4);
  font-size: 0.875rem;
  padding: 0.375rem 0.625rem;
  outline: none;
  transition: border-color 0.15s;
}

.wpm-add-input:focus {
  border-color: var(--color-accent, #89b4fa);
}

.wpm-add-form-btns {
  display: flex;
  gap: 0.375rem;
  justify-content: flex-end;
}

/* ── Reduced motion ─────────────────────────────────────────────────────── */

@media (prefers-reduced-motion: reduce) {
  .wpm-overlay,
  .wpm-dialog {
    transition: none;
    animation: none;
  }
}
</style>
