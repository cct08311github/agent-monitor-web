<script setup lang="ts">
/**
 * ThemeScheduleSetting — modal for configuring the automatic theme schedule.
 *
 * Opens from KeyboardShortcutsHelp footer; mounted at App.vue level via
 * useThemeScheduleSetting() shared state. Backdrop click or Esc closes it.
 */
import { ref, watch, nextTick, onUnmounted, computed } from 'vue'
import { useThemeScheduleSetting } from '@/composables/useThemeScheduleSetting'
import { useThemeSchedule } from '@/composables/useThemeSchedule'
import { useToast } from '@/composables/useToast'
import { parseHM } from '@/utils/themeSchedule'
import { createFocusTrap } from '@/lib/focusTrap'
import type { ThemeScheduleConfig } from '@/utils/themeSchedule'

const { isOpen, close } = useThemeScheduleSetting()
const { config, update } = useThemeSchedule()
const toast = useToast()

// ---------------------------------------------------------------------------
// Local form state — mirrored from shared config when modal opens
// ---------------------------------------------------------------------------

const localEnabled = ref(false)
const localLightAt = ref('06:00')
const localDarkAt = ref('18:00')
const validationError = ref('')

// Sync local form when modal opens
watch(isOpen, (visible) => {
  if (visible) {
    localEnabled.value = config.value.enabled
    localLightAt.value = config.value.lightAt
    localDarkAt.value = config.value.darkAt
    validationError.value = ''
  }
})

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const isValid = computed(
  () => parseHM(localLightAt.value) !== null && parseHM(localDarkAt.value) !== null,
)

function validate(): boolean {
  if (parseHM(localLightAt.value) === null) {
    validationError.value = 'Light 時間格式無效（請用 HH:MM）'
    return false
  }
  if (parseHM(localDarkAt.value) === null) {
    validationError.value = 'Dark 時間格式無效（請用 HH:MM）'
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

  const next: ThemeScheduleConfig = {
    enabled: localEnabled.value,
    lightAt: localLightAt.value,
    darkAt: localDarkAt.value,
  }
  update(next)
  toast.success('已套用主題排程')
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
      class="tss-overlay"
      @click.self="handleCancel"
    >
      <div
        ref="dialogRef"
        class="tss-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tss-title"
        tabindex="-1"
        @keydown.esc.stop="handleCancel"
      >
        <!-- Header -->
        <div class="tss-header">
          <h2 id="tss-title" class="tss-title">🕒 主題排程</h2>
          <button
            class="tss-close-btn"
            aria-label="關閉主題排程設定"
            @click="handleCancel"
          >
            ✕
          </button>
        </div>

        <!-- Body -->
        <div class="tss-body">
          <p class="tss-description">
            排程會根據時段自動切換主題. 手動按 T 切換會暫時生效，直到下一個切換時間點.
          </p>

          <!-- Enable toggle -->
          <label class="tss-toggle-row">
            <input
              v-model="localEnabled"
              type="checkbox"
              class="tss-checkbox"
            />
            <span class="tss-toggle-label">啟用自動主題切換</span>
          </label>

          <!-- Time inputs -->
          <div class="tss-time-row" :class="{ 'tss-time-row--disabled': !localEnabled }">
            <div class="tss-field">
              <label for="tss-light-at" class="tss-label">切到 light 主題的時間</label>
              <input
                id="tss-light-at"
                v-model="localLightAt"
                type="time"
                class="tss-time-input"
                :disabled="!localEnabled"
              />
            </div>

            <div class="tss-field">
              <label for="tss-dark-at" class="tss-label">切到 dark 主題的時間</label>
              <input
                id="tss-dark-at"
                v-model="localDarkAt"
                type="time"
                class="tss-time-input"
                :disabled="!localEnabled"
              />
            </div>
          </div>

          <!-- Overnight hint -->
          <p
            v-if="localEnabled && localLightAt > localDarkAt"
            class="tss-hint tss-hint--overnight"
          >
            ↩ 跨日模式：light 從 {{ localLightAt }} 到次日 {{ localDarkAt }}
          </p>

          <!-- Validation error -->
          <p
            v-if="validationError"
            class="tss-error"
            role="alert"
          >
            {{ validationError }}
          </p>
        </div>

        <!-- Footer -->
        <div class="tss-footer">
          <button
            class="tss-btn tss-btn--secondary"
            @click="handleCancel"
          >
            取消
          </button>
          <button
            class="tss-btn tss-btn--primary"
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
.tss-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.tss-dialog {
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

.tss-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem 0.75rem;
  border-bottom: 1px solid var(--color-border, #313244);
  flex-shrink: 0;
}

.tss-title {
  font-size: 1rem;
  font-weight: 600;
  margin: 0;
  color: var(--color-text, #cdd6f4);
}

.tss-close-btn {
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

.tss-close-btn:hover {
  color: var(--color-text, #cdd6f4);
  background: var(--color-surface-hover, #313244);
}

/* ── Body ────────────────────────────────────────────────────────────────── */

.tss-body {
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.tss-description {
  font-size: 0.875rem;
  color: var(--color-muted, #6c7086);
  margin: 0;
  line-height: 1.5;
}

.tss-toggle-row {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  cursor: pointer;
}

.tss-checkbox {
  width: 1rem;
  height: 1rem;
  accent-color: var(--color-accent, #89b4fa);
  cursor: pointer;
  flex-shrink: 0;
}

.tss-toggle-label {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text, #cdd6f4);
  user-select: none;
}

.tss-time-row {
  display: flex;
  align-items: flex-end;
  gap: 0.75rem;
}

.tss-time-row--disabled {
  opacity: 0.4;
  pointer-events: none;
}

.tss-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  flex: 1;
}

.tss-label {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--color-muted, #6c7086);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.tss-time-input {
  background: var(--color-surface-raised, #181825);
  border: 1px solid var(--color-border, #313244);
  border-radius: 0.375rem;
  color: var(--color-text, #cdd6f4);
  font-size: 0.875rem;
  padding: 0.4rem 0.6rem;
  width: 100%;
  min-width: 0;
}

.tss-time-input:focus {
  outline: 2px solid var(--color-accent, #89b4fa);
  outline-offset: 1px;
}

.tss-time-input:disabled {
  cursor: not-allowed;
}

.tss-hint {
  font-size: 0.8125rem;
  color: var(--color-accent, #89b4fa);
  margin: 0;
}

.tss-hint--overnight {
  font-style: italic;
}

.tss-error {
  font-size: 0.8125rem;
  color: var(--color-error, #f38ba8);
  margin: 0;
}

/* ── Footer ─────────────────────────────────────────────────────────────── */

.tss-footer {
  padding: 0.75rem 1.25rem;
  border-top: 1px solid var(--color-border, #313244);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.5rem;
}

.tss-btn {
  border-radius: 0.375rem;
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 500;
  padding: 0.4rem 1rem;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}

.tss-btn--secondary {
  background: none;
  border: 1px solid var(--color-border, #313244);
  color: var(--color-muted, #6c7086);
}

.tss-btn--secondary:hover {
  color: var(--color-text, #cdd6f4);
  border-color: var(--color-text, #cdd6f4);
}

.tss-btn--primary {
  background: var(--color-accent, #89b4fa);
  border: 1px solid transparent;
  color: var(--color-surface, #1e1e2e);
}

.tss-btn--primary:hover:not(:disabled) {
  filter: brightness(1.1);
}

.tss-btn--primary:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* ── Reduced motion ─────────────────────────────────────────────────────── */

@media (prefers-reduced-motion: reduce) {
  .tss-overlay,
  .tss-dialog,
  .tss-btn,
  .tss-close-btn {
    transition: none;
    animation: none;
  }
}
</style>
