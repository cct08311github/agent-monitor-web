<script setup lang="ts">
import { ref, watch, computed, nextTick, onUnmounted } from 'vue'
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts'
import { createFocusTrap } from '@/lib/focusTrap'

// ---------------------------------------------------------------------------
// Props & emits
// ---------------------------------------------------------------------------

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

// ---------------------------------------------------------------------------
// Shortcuts list
// ---------------------------------------------------------------------------

const { getShortcuts } = useKeyboardShortcuts()

const groupedShortcuts = computed(() => {
  const all = getShortcuts()
  const groups: Record<string, { key: string; description: string }[]> = {}
  for (const s of all) {
    const cat = s.category ?? 'General'
    if (!groups[cat]) groups[cat] = []
    let displayKey = s.key
    if (s.ctrl) displayKey = `Ctrl+${displayKey}`
    if (s.shift) displayKey = `Shift+${displayKey}`
    if (s.alt) displayKey = `Alt+${displayKey}`
    if (s.meta) displayKey = `Meta+${displayKey}`
    groups[cat].push({ key: displayKey, description: s.description })
  }
  return groups
})

// ---------------------------------------------------------------------------
// Focus trap
// ---------------------------------------------------------------------------

const dialogRef = ref<HTMLDivElement | null>(null)
const trap = createFocusTrap()

watch(
  () => props.open,
  async (visible) => {
    if (visible) {
      await nextTick()
      if (dialogRef.value) {
        trap.activate(dialogRef.value, () => emit('close'))
      }
    } else {
      trap.deactivate()
    }
  },
)

onUnmounted(() => {
  trap.deactivate()
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="help-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-modal-title"
      @click.self="$emit('close')"
    >
      <div ref="dialogRef" class="help-dialog">
        <div class="help-header">
          <h2 id="help-modal-title" class="help-title">⌨️ 快捷鍵清單</h2>
          <button class="help-close-btn" aria-label="關閉" @click="$emit('close')">✕</button>
        </div>

        <div class="help-body">
          <div
            v-for="(shortcuts, category) in groupedShortcuts"
            :key="category"
            class="help-group"
          >
            <h3 class="help-group-title">{{ category }}</h3>
            <table class="help-table">
              <thead>
                <tr>
                  <th class="help-th-key">按鍵</th>
                  <th class="help-th-desc">功能說明</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(shortcut, i) in shortcuts" :key="i" class="help-row">
                  <td class="help-td-key">
                    <kbd class="help-kbd">{{ shortcut.key }}</kbd>
                  </td>
                  <td class="help-td-desc">{{ shortcut.description }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <p v-if="Object.keys(groupedShortcuts).length === 0" class="help-empty">
            目前沒有已註冊的快捷鍵。
          </p>
        </div>

        <div class="help-footer">
          <span class="help-hint">在輸入框中快捷鍵不生效（Esc 除外）</span>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.help-overlay {
  position: fixed;
  inset: 0;
  z-index: 1100;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.help-dialog {
  background: var(--color-surface, #1e1e2e);
  color: var(--color-text, #cdd6f4);
  border: 1px solid var(--color-border, #313244);
  border-radius: 0.75rem;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  width: 100%;
  max-width: 520px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  outline: none;
}

.help-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem 0.75rem;
  border-bottom: 1px solid var(--color-border, #313244);
  flex-shrink: 0;
}

.help-title {
  font-size: 1rem;
  font-weight: 600;
  margin: 0;
  color: var(--color-text, #cdd6f4);
}

.help-close-btn {
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

.help-close-btn:hover {
  color: var(--color-text, #cdd6f4);
  background: var(--color-surface-hover, #313244);
}

.help-body {
  overflow-y: auto;
  padding: 1rem 1.25rem;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.help-group-title {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-accent, #89b4fa);
  margin: 0 0 0.5rem;
}

.help-table {
  width: 100%;
  border-collapse: collapse;
}

.help-th-key,
.help-th-desc {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-muted, #6c7086);
  padding: 0.25rem 0.5rem 0.5rem;
  text-align: left;
  border-bottom: 1px solid var(--color-border, #313244);
}

.help-th-key {
  width: 7rem;
}

.help-row:not(:last-child) td {
  border-bottom: 1px solid var(--color-border-subtle, #1e1e2e);
}

.help-td-key,
.help-td-desc {
  padding: 0.45rem 0.5rem;
  font-size: 0.875rem;
  vertical-align: middle;
}

.help-kbd {
  display: inline-block;
  background: var(--color-surface-raised, #181825);
  border: 1px solid var(--color-border, #313244);
  border-radius: 0.3rem;
  padding: 0.1rem 0.45rem;
  font-family: ui-monospace, 'SFMono-Regular', Menlo, monospace;
  font-size: 0.8rem;
  color: var(--color-text, #cdd6f4);
  white-space: nowrap;
  box-shadow: 0 1px 0 var(--color-border, #313244);
}

.help-empty {
  font-size: 0.875rem;
  color: var(--color-muted, #6c7086);
  text-align: center;
  padding: 1rem 0;
}

.help-footer {
  padding: 0.625rem 1.25rem;
  border-top: 1px solid var(--color-border, #313244);
  flex-shrink: 0;
}

.help-hint {
  font-size: 0.75rem;
  color: var(--color-muted, #6c7086);
}
</style>
