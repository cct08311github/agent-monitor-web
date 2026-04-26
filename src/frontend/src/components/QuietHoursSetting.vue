<script setup lang="ts">
/**
 * QuietHoursSetting — modal for configuring the "Quiet Hours" notification
 * suppression window.
 *
 * Opens from KeyboardShortcutsHelp footer; mounted at App.vue level via
 * useQuietHoursSetting() shared state. Backdrop click or Esc closes the modal.
 */
import { ref, watch, nextTick, onUnmounted, computed } from 'vue'
import { useQuietHoursSetting } from '@/composables/useQuietHoursSetting'
import { useQuietHours } from '@/composables/useQuietHours'
import { useToast } from '@/composables/useToast'
import { parseHM } from '@/utils/quietHours'
import { createFocusTrap } from '@/lib/focusTrap'
import type { QuietHoursConfig } from '@/utils/quietHours'

const { isOpen, close } = useQuietHoursSetting()
const { config, update } = useQuietHours()
const toast = useToast()

// ---------------------------------------------------------------------------
// Local form state — mirrored from shared config when modal opens
// ---------------------------------------------------------------------------

const localEnabled = ref(false)
const localStart = ref('22:00')
const localEnd = ref('07:00')
const validationError = ref('')

// Sync local form when modal opens
watch(isOpen, (visible) => {
  if (visible) {
    localEnabled.value = config.value.enabled
    localStart.value = config.value.start
    localEnd.value = config.value.end
    validationError.value = ''
  }
})

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const isValid = computed(() => {
  return parseHM(localStart.value) !== null && parseHM(localEnd.value) !== null
})

function validate(): boolean {
  if (parseHM(localStart.value) === null) {
    validationError.value = '開始時間格式無效（請用 HH:MM）'
    return false
  }
  if (parseHM(localEnd.value) === null) {
    validationError.value = '結束時間格式無效（請用 HH:MM）'
    return false
  }
  validationError.value = ''
  return true
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function handleSave(): void {
  if (!validate()) return

  const next: QuietHoursConfig = {
    enabled: localEnabled.value,
    start: localStart.value,
    end: localEnd.value,
  }
  update(next)
  toast.success('已套用安靜時段設定')
  close()
}

function handleCancel(): void {
  close()
}

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
      class="qhs-overlay"
      @click.self="handleCancel"
    >
      <div
        ref="dialogRef"
        class="qhs-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="qhs-title"
        tabindex="-1"
        @keydown.esc.stop="handleCancel"
      >
        <!-- Header -->
        <div class="qhs-header">
          <h2 id="qhs-title" class="qhs-title">🌙 安靜時段設定</h2>
          <button
            class="qhs-close-btn"
            aria-label="關閉安靜時段設定"
            @click="handleCancel"
          >
            ✕
          </button>
        </div>

        <!-- Body -->
        <div class="qhs-body">
          <p class="qhs-description">
            在這段時間內，新 alert 不會更新標題列徽章（仍會記錄）。
          </p>

          <!-- Enable toggle -->
          <label class="qhs-toggle-row">
            <input
              v-model="localEnabled"
              type="checkbox"
              class="qhs-checkbox"
            />
            <span class="qhs-toggle-label">啟用安靜時段</span>
          </label>

          <!-- Time inputs -->
          <div class="qhs-time-row" :class="{ 'qhs-time-row--disabled': !localEnabled }">
            <div class="qhs-field">
              <label for="qhs-start" class="qhs-label">開始時間</label>
              <input
                id="qhs-start"
                v-model="localStart"
                type="time"
                class="qhs-time-input"
                :disabled="!localEnabled"
              />
            </div>

            <span class="qhs-arrow" aria-hidden="true">→</span>

            <div class="qhs-field">
              <label for="qhs-end" class="qhs-label">結束時間</label>
              <input
                id="qhs-end"
                v-model="localEnd"
                type="time"
                class="qhs-time-input"
                :disabled="!localEnabled"
              />
            </div>
          </div>

          <!-- Overnight hint -->
          <p
            v-if="localEnabled && localStart > localEnd"
            class="qhs-hint qhs-hint--overnight"
          >
            ↩ 跨日模式：{{ localStart }} 至次日 {{ localEnd }}
          </p>

          <!-- Validation error -->
          <p
            v-if="validationError"
            class="qhs-error"
            role="alert"
          >
            {{ validationError }}
          </p>
        </div>

        <!-- Footer -->
        <div class="qhs-footer">
          <button
            class="qhs-btn qhs-btn--secondary"
            @click="handleCancel"
          >
            取消
          </button>
          <button
            class="qhs-btn qhs-btn--primary"
            :disabled="!isValid"
            @click="handleSave"
          >
            儲存
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.qhs-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.qhs-dialog {
  background: var(--color-surface, #1e1e2e);
  color: var(--color-text, #cdd6f4);
  border: 1px solid var(--color-border, #313244);
  border-radius: 0.75rem;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  width: 100%;
  max-width: 420px;
  display: flex;
  flex-direction: column;
  outline: none;
}

/* ── Header ─────────────────────────────────────────────────────────────── */

.qhs-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem 0.75rem;
  border-bottom: 1px solid var(--color-border, #313244);
  flex-shrink: 0;
}

.qhs-title {
  font-size: 1rem;
  font-weight: 600;
  margin: 0;
  color: var(--color-text, #cdd6f4);
}

.qhs-close-btn {
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

.qhs-close-btn:hover {
  color: var(--color-text, #cdd6f4);
  background: var(--color-surface-hover, #313244);
}

/* ── Body ────────────────────────────────────────────────────────────────── */

.qhs-body {
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.qhs-description {
  font-size: 0.875rem;
  color: var(--color-muted, #6c7086);
  margin: 0;
  line-height: 1.5;
}

.qhs-toggle-row {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  cursor: pointer;
}

.qhs-checkbox {
  width: 1rem;
  height: 1rem;
  accent-color: var(--color-accent, #89b4fa);
  cursor: pointer;
  flex-shrink: 0;
}

.qhs-toggle-label {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text, #cdd6f4);
  user-select: none;
}

.qhs-time-row {
  display: flex;
  align-items: flex-end;
  gap: 0.75rem;
}

.qhs-time-row--disabled {
  opacity: 0.4;
  pointer-events: none;
}

.qhs-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  flex: 1;
}

.qhs-label {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--color-muted, #6c7086);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.qhs-time-input {
  background: var(--color-surface-raised, #181825);
  border: 1px solid var(--color-border, #313244);
  border-radius: 0.375rem;
  color: var(--color-text, #cdd6f4);
  font-size: 0.875rem;
  padding: 0.4rem 0.6rem;
  width: 100%;
  min-width: 0;
}

.qhs-time-input:focus {
  outline: 2px solid var(--color-accent, #89b4fa);
  outline-offset: 1px;
}

.qhs-time-input:disabled {
  cursor: not-allowed;
}

.qhs-arrow {
  font-size: 1rem;
  color: var(--color-muted, #6c7086);
  padding-bottom: 0.45rem;
  flex-shrink: 0;
}

.qhs-hint {
  font-size: 0.8125rem;
  color: var(--color-accent, #89b4fa);
  margin: 0;
}

.qhs-hint--overnight {
  font-style: italic;
}

.qhs-error {
  font-size: 0.8125rem;
  color: var(--color-error, #f38ba8);
  margin: 0;
}

/* ── Footer ─────────────────────────────────────────────────────────────── */

.qhs-footer {
  padding: 0.75rem 1.25rem;
  border-top: 1px solid var(--color-border, #313244);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.5rem;
}

.qhs-btn {
  border-radius: 0.375rem;
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 500;
  padding: 0.4rem 1rem;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}

.qhs-btn--secondary {
  background: none;
  border: 1px solid var(--color-border, #313244);
  color: var(--color-muted, #6c7086);
}

.qhs-btn--secondary:hover {
  color: var(--color-text, #cdd6f4);
  border-color: var(--color-text, #cdd6f4);
}

.qhs-btn--primary {
  background: var(--color-accent, #89b4fa);
  border: 1px solid transparent;
  color: var(--color-surface, #1e1e2e);
}

.qhs-btn--primary:hover:not(:disabled) {
  filter: brightness(1.1);
}

.qhs-btn--primary:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* ── Reduced motion ─────────────────────────────────────────────────────── */

@media (prefers-reduced-motion: reduce) {
  .qhs-overlay,
  .qhs-dialog,
  .qhs-btn,
  .qhs-close-btn {
    transition: none;
    animation: none;
  }
}
</style>
