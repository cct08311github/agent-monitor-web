<script setup lang="ts">
/**
 * KeyboardShortcutsHelp — cheatsheet overlay showing all keyboard shortcuts.
 *
 * Opens on "?" (outside inputs), closes on Esc or backdrop click.
 * State is driven by the shared useKeyboardShortcutsHelp composable;
 * mount this component once in App.vue.
 */
import { watch, nextTick, onUnmounted, ref } from 'vue'
import { useKeyboardShortcutsHelp } from '@/composables/useKeyboardShortcutsHelp'
import { groupByCategory, SHORTCUTS } from '@/data/keyboardShortcuts'
import { createFocusTrap } from '@/lib/focusTrap'
import { useOnboardingTour } from '@/composables/useOnboardingTour'
import { useQuietHoursSetting } from '@/composables/useQuietHoursSetting'

const { isOpen, close } = useKeyboardShortcutsHelp()
const { restart: restartTour } = useOnboardingTour()
const { open: openQuietHours } = useQuietHoursSetting()

function handleRestartTour(): void {
  close()
  restartTour()
}

function handleOpenQuietHours(): void {
  close()
  openQuietHours()
}

// ---------------------------------------------------------------------------
// Grouped shortcut data (static — no filtering needed here; HelpModal handles search)
// ---------------------------------------------------------------------------

const grouped = groupByCategory(SHORTCUTS)

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
      class="ksh-overlay"
      @click.self="close"
    >
      <div
        ref="dialogRef"
        class="ksh-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ksh-title"
        tabindex="-1"
        @keydown.esc.stop="close"
      >
        <!-- Header -->
        <div class="ksh-header">
          <h2 id="ksh-title" class="ksh-title">⌨️ 快捷鍵清單</h2>
          <button
            class="ksh-close-btn"
            aria-label="關閉快捷鍵面板"
            @click="close"
          >✕</button>
        </div>

        <!-- Body: category groups -->
        <div class="ksh-body">
          <div
            v-for="[category, entries] in grouped"
            :key="category"
            class="ksh-group"
          >
            <h3 class="ksh-group-title">{{ category }}</h3>
            <table class="ksh-table">
              <thead>
                <tr>
                  <th class="ksh-th-keys">按鍵</th>
                  <th class="ksh-th-desc">功能說明</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="entry in entries" :key="entry.description" class="ksh-row">
                  <td class="ksh-td-keys">
                    <span class="ksh-kbd-combo">
                      <kbd
                        v-for="k in entry.keys"
                        :key="k"
                        class="ksh-key-badge"
                      >{{ k }}</kbd>
                    </span>
                  </td>
                  <td class="ksh-td-desc">{{ entry.description }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Footer -->
        <div class="ksh-footer">
          <span class="ksh-hint">在輸入框中快捷鍵不生效（Esc 除外）</span>
          <div class="ksh-footer-actions">
            <button class="ksh-restart-tour-btn" @click="handleRestartTour">
              🎓 重新觀看引導
            </button>
            <button class="ksh-quiet-hours-btn" @click="handleOpenQuietHours">
              🌙 安靜時段
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.ksh-overlay {
  position: fixed;
  inset: 0;
  z-index: 1150;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.ksh-dialog {
  background: var(--color-surface, #1e1e2e);
  color: var(--color-text, #cdd6f4);
  border: 1px solid var(--color-border, #313244);
  border-radius: 0.75rem;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  width: 100%;
  max-width: 560px;
  max-height: 82vh;
  display: flex;
  flex-direction: column;
  outline: none;
}

/* ── Header ─────────────────────────────────────────────────────────────── */

.ksh-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem 0.75rem;
  border-bottom: 1px solid var(--color-border, #313244);
  flex-shrink: 0;
}

.ksh-title {
  font-size: 1rem;
  font-weight: 600;
  margin: 0;
  color: var(--color-text, #cdd6f4);
}

.ksh-close-btn {
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

.ksh-close-btn:hover {
  color: var(--color-text, #cdd6f4);
  background: var(--color-surface-hover, #313244);
}

/* ── Body / groups ──────────────────────────────────────────────────────── */

.ksh-body {
  overflow-y: auto;
  padding: 1rem 1.25rem;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.ksh-group-title {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-accent, #89b4fa);
  margin: 0 0 0.5rem;
}

.ksh-table {
  width: 100%;
  border-collapse: collapse;
}

.ksh-th-keys,
.ksh-th-desc {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-muted, #6c7086);
  padding: 0.25rem 0.5rem 0.5rem;
  text-align: left;
  border-bottom: 1px solid var(--color-border, #313244);
}

.ksh-th-keys {
  width: 9rem;
}

.ksh-row:not(:last-child) td {
  border-bottom: 1px solid var(--color-border-subtle, #1e1e2e);
}

.ksh-td-keys,
.ksh-td-desc {
  padding: 0.45rem 0.5rem;
  font-size: 0.875rem;
  vertical-align: middle;
}

/* ── <kbd> chips ─────────────────────────────────────────────────────────── */

.ksh-kbd-combo {
  display: inline-flex;
  align-items: center;
  flex-wrap: nowrap;
  gap: 2px;
}

.ksh-key-badge {
  display: inline-block;
  padding: 1px 6px;
  font-family: ui-monospace, 'SFMono-Regular', Menlo, monospace;
  font-size: 11px;
  background: var(--color-surface-raised, #181825);
  border: 1px solid var(--color-border, #313244);
  border-radius: 3px;
  line-height: 1.4;
  color: var(--color-text, #cdd6f4);
  white-space: nowrap;
  box-shadow: 0 1px 0 var(--color-border, #313244);
}

/* ── Footer ─────────────────────────────────────────────────────────────── */

.ksh-footer {
  padding: 0.625rem 1.25rem;
  border-top: 1px solid var(--color-border, #313244);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.ksh-hint {
  font-size: 0.75rem;
  color: var(--color-muted, #6c7086);
}

.ksh-footer-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.ksh-restart-tour-btn {
  background: none;
  border: 1px solid var(--color-border, #313244);
  color: var(--color-muted, #6c7086);
  cursor: pointer;
  font-size: 0.75rem;
  padding: 0.2rem 0.6rem;
  border-radius: 0.375rem;
  transition: color 0.15s, border-color 0.15s;
  line-height: 1.5;
}

.ksh-restart-tour-btn:hover {
  color: var(--color-text, #cdd6f4);
  border-color: var(--color-text, #cdd6f4);
}

.ksh-quiet-hours-btn {
  background: none;
  border: 1px solid var(--color-border, #313244);
  color: var(--color-muted, #6c7086);
  cursor: pointer;
  font-size: 0.75rem;
  padding: 0.2rem 0.6rem;
  border-radius: 0.375rem;
  transition: color 0.15s, border-color 0.15s;
  line-height: 1.5;
}

.ksh-quiet-hours-btn:hover {
  color: var(--color-text, #cdd6f4);
  border-color: var(--color-text, #cdd6f4);
}

/* ── Reduced motion ─────────────────────────────────────────────────────── */

@media (prefers-reduced-motion: reduce) {
  .ksh-overlay,
  .ksh-dialog {
    transition: none;
    animation: none;
  }
}
</style>
