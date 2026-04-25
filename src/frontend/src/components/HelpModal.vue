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

const searchQuery = ref('')
const searchInputRef = ref<HTMLInputElement | null>(null)

interface DisplayShortcut {
  key: string
  description: string
  rawKey: string
  rawDescription: string
}

const groupedShortcuts = computed(() => {
  const all = getShortcuts()
  const groups: Record<string, DisplayShortcut[]> = {}
  for (const s of all) {
    const cat = s.category ?? 'General'
    if (!groups[cat]) groups[cat] = []
    let displayKey = s.key
    if (s.ctrl) displayKey = `Ctrl+${displayKey}`
    if (s.shift) displayKey = `Shift+${displayKey}`
    if (s.alt) displayKey = `Alt+${displayKey}`
    if (s.meta) displayKey = `Meta+${displayKey}`
    groups[cat].push({
      key: displayKey,
      description: s.description,
      rawKey: s.key,
      rawDescription: s.description,
    })
  }
  return groups
})

const filteredShortcuts = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return groupedShortcuts.value

  const result: Record<string, DisplayShortcut[]> = {}
  for (const [category, shortcuts] of Object.entries(groupedShortcuts.value)) {
    const matched = shortcuts.filter(
      (s) =>
        s.description.toLowerCase().includes(query) ||
        s.key.toLowerCase().includes(query) ||
        s.rawKey.toLowerCase().includes(query),
    )
    if (matched.length > 0) {
      result[category] = matched
    }
  }
  return result
})

const hasResults = computed(() => Object.keys(filteredShortcuts.value).length > 0)

// ---------------------------------------------------------------------------
// Focus trap
// ---------------------------------------------------------------------------

const dialogRef = ref<HTMLDivElement | null>(null)
const trap = createFocusTrap()

watch(
  () => props.open,
  async (visible) => {
    if (visible) {
      searchQuery.value = ''
      await nextTick()
      if (dialogRef.value) {
        trap.activate(dialogRef.value, () => emit('close'))
      }
      await nextTick()
      searchInputRef.value?.focus()
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

        <div class="help-search-bar">
          <input
            ref="searchInputRef"
            v-model="searchQuery"
            type="search"
            class="help-search-input"
            placeholder="搜尋 shortcut..."
            aria-label="搜尋快捷鍵"
          />
        </div>

        <div class="help-body">
          <div
            v-for="(shortcuts, category) in filteredShortcuts"
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

          <p
            v-if="!hasResults && searchQuery.trim()"
            class="help-empty help-no-match"
          >
            無符合 shortcut
          </p>

          <p v-if="!hasResults && !searchQuery.trim()" class="help-empty">
            目前沒有已註冊的快捷鍵。
          </p>
        </div>

        <div class="help-footer">
          <span class="help-hint">在輸入框中快捷鍵不生效（Esc 除外）</span>
          <span class="help-cmdK-hint">按 <kbd class="help-kbd-inline">⌘K</kbd>（或 <kbd class="help-kbd-inline">Ctrl+K</kbd>）開啟 Command Palette → 行動模式</span>
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

.help-search-bar {
  padding: 0.625rem 1.25rem;
  border-bottom: 1px solid var(--color-border, #313244);
  flex-shrink: 0;
}

.help-search-input {
  width: 100%;
  box-sizing: border-box;
  background: var(--color-surface-raised, #181825);
  border: 1px solid var(--color-border, #313244);
  border-radius: 0.5rem;
  color: var(--color-text, #cdd6f4);
  font-size: 0.875rem;
  padding: 0.45rem 0.75rem;
  outline: none;
  transition: border-color 0.15s;
}

.help-search-input::placeholder {
  color: var(--color-muted, #6c7086);
}

.help-search-input:focus {
  border-color: var(--color-accent, #89b4fa);
}

/* Remove native search clear button in Webkit */
.help-search-input::-webkit-search-cancel-button {
  -webkit-appearance: none;
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

.help-kbd-inline {
  display: inline-block;
  background: var(--color-surface-raised, #181825);
  border: 1px solid var(--color-border, #313244);
  border-radius: 0.25rem;
  padding: 0.05rem 0.35rem;
  font-family: ui-monospace, 'SFMono-Regular', Menlo, monospace;
  font-size: 0.7rem;
  color: var(--color-text, #cdd6f4);
  white-space: nowrap;
}

.help-empty {
  font-size: 0.875rem;
  color: var(--color-muted, #6c7086);
  text-align: center;
  padding: 1rem 0;
}

.help-no-match {
  color: var(--color-muted, #6c7086);
}

.help-footer {
  padding: 0.625rem 1.25rem;
  border-top: 1px solid var(--color-border, #313244);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.help-hint {
  font-size: 0.75rem;
  color: var(--color-muted, #6c7086);
}

.help-cmdK-hint {
  font-size: 0.75rem;
  font-style: italic;
  color: var(--color-accent, #89b4fa);
  opacity: 0.85;
}
</style>
