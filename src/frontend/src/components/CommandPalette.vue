<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { appState } from '@/stores/appState'
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts'
import { useTheme } from '@/composables/useTheme'
import { createFocusTrap } from '@/lib/focusTrap'

// ---------------------------------------------------------------------------
// Recents persistence constants
// ---------------------------------------------------------------------------

const RECENTS_KEY = 'oc_palette_recent'
const RECENTS_MAX = 5

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
// Command interface
// ---------------------------------------------------------------------------

interface Command {
  id: string
  label: string
  description?: string
  category: 'Navigation' | 'Actions' | 'Shortcut'
  keywords?: string[]
  handler: () => void
  // modifier flags — only populated for Shortcut category
  shortcutKey?: string
  shortcutMeta?: boolean
  shortcutCtrl?: boolean
  shortcutShift?: boolean
  shortcutAlt?: boolean
}

// ---------------------------------------------------------------------------
// Composables
// ---------------------------------------------------------------------------

const { getShortcuts } = useKeyboardShortcuts()
const { cycleTheme } = useTheme()

// ---------------------------------------------------------------------------
// Static commands registry
// ---------------------------------------------------------------------------

const STATIC_COMMANDS: Command[] = [
  // Navigation — tab switching
  {
    id: 'nav-monitor',
    label: '前往 監控',
    description: '切換到 Monitor tab',
    category: 'Navigation',
    keywords: ['monitor', '監控', '1'],
    handler: () => {
      appState.currentDesktopTab = 'monitor'
    },
  },
  {
    id: 'nav-system',
    label: '前往 系統',
    description: '切換到 System tab',
    category: 'Navigation',
    keywords: ['system', '系統', '2'],
    handler: () => {
      appState.currentDesktopTab = 'system'
    },
  },
  {
    id: 'nav-logs',
    label: '前往 日誌',
    description: '切換到 Logs tab',
    category: 'Navigation',
    keywords: ['logs', '日誌', 'log', '3'],
    handler: () => {
      appState.currentDesktopTab = 'logs'
    },
  },
  {
    id: 'nav-chat',
    label: '前往 聊天',
    description: '切換到 Chat tab',
    category: 'Navigation',
    keywords: ['chat', '聊天', '4'],
    handler: () => {
      appState.currentDesktopTab = 'chat'
    },
  },
  {
    id: 'nav-optimize',
    label: '前往 優化',
    description: '切換到 Optimize tab',
    category: 'Navigation',
    keywords: ['optimize', '優化', '5'],
    handler: () => {
      appState.currentDesktopTab = 'optimize'
    },
  },
  // Navigation — Observability shortcut
  {
    id: 'nav-observability',
    label: '前往 Observability',
    description: '切換到 Monitor › Observability sub-tab',
    category: 'Navigation',
    keywords: ['observability', '可觀測', 'metrics', 'errors'],
    handler: () => {
      appState.currentDesktopTab = 'monitor'
      appState.preferredMonitorSubTab = 'observability'
    },
  },
  // Actions
  {
    id: 'action-toggle-theme',
    label: '切換主題',
    description: '在 Light / Dark / Auto 之間循環',
    category: 'Actions',
    keywords: ['theme', '主題', 'dark', 'light', 'auto', '深色', '淺色'],
    handler: () => {
      cycleTheme()
    },
  },
  {
    id: 'action-help',
    label: '顯示快捷鍵',
    description: '打開快捷鍵清單對話框',
    category: 'Actions',
    keywords: ['help', '快捷', 'keyboard', 'shortcut', '說明'],
    handler: () => {
      emit('close')
      emit('open-help' as never)
    },
  },
]

// ---------------------------------------------------------------------------
// Dynamic shortcut commands (pulled fresh on each open)
// ---------------------------------------------------------------------------

function buildShortcutCommands(): Command[] {
  return getShortcuts().map((s) => {
    // Plain-text description kept for search/filter compatibility
    let keyDisplay = s.key
    if (s.ctrl) keyDisplay = `Ctrl+${keyDisplay}`
    if (s.shift) keyDisplay = `Shift+${keyDisplay}`
    if (s.alt) keyDisplay = `Alt+${keyDisplay}`
    if (s.meta) keyDisplay = `Cmd+${keyDisplay}`

    return {
      id: `shortcut-${s.key}-${s.category ?? 'general'}`,
      label: s.description,
      description: keyDisplay,
      category: 'Shortcut' as const,
      keywords: [s.key, s.category ?? ''],
      handler: () => {
        // Invoke the shortcut handler with a synthetic event
        s.handler(new KeyboardEvent('keydown', { key: s.key }))
      },
      // Preserve modifier flags for kbd badge rendering
      shortcutKey: s.key,
      shortcutMeta: s.meta,
      shortcutCtrl: s.ctrl,
      shortcutShift: s.shift,
      shortcutAlt: s.alt,
    }
  })
}

// ---------------------------------------------------------------------------
// Recents state & persistence
// ---------------------------------------------------------------------------

const recentIds = ref<string[]>([])

function loadRecents(): void {
  try {
    const raw = localStorage.getItem(RECENTS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        recentIds.value = parsed as string[]
      }
    }
  } catch {
    // Silent fallback — localStorage unavailable or JSON malformed
    recentIds.value = []
  }
}

function pushRecent(id: string): void {
  // Dedupe: remove any existing occurrence then prepend
  const updated = [id, ...recentIds.value.filter((r) => r !== id)].slice(0, RECENTS_MAX)
  recentIds.value = updated
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(updated))
  } catch {
    // Silent fallback — storage quota or private browsing
  }
}

onMounted(() => {
  loadRecents()
})

// ---------------------------------------------------------------------------
// Search state
// ---------------------------------------------------------------------------

const query = ref('')
const selectedIndex = ref(0)
const inputRef = ref<HTMLInputElement | null>(null)
const dialogRef = ref<HTMLDivElement | null>(null)

/** All available commands — rebuilt on each open to capture latest shortcuts */
const allCommands = ref<Command[]>([])

/** Recent commands: map recentIds → actual commands, filtering out unknown ids */
const recentCommands = computed<Command[]>(() => {
  return recentIds.value
    .map((id) => allCommands.value.find((cmd) => cmd.id === id))
    .filter((cmd): cmd is Command => cmd !== undefined)
})

const filteredCommands = computed<Command[]>(() => {
  const q = query.value.trim()
  if (!q) {
    // Empty query: recent commands first, then all other commands (no duplication)
    const recentIdSet = new Set(recentIds.value)
    const nonRecent = allCommands.value.filter((cmd) => !recentIdSet.has(cmd.id))
    return [...recentCommands.value, ...nonRecent]
  }

  const ql = q.toLowerCase()
  return allCommands.value.filter((cmd) => {
    if (cmd.label.toLowerCase().includes(ql)) return true
    if (cmd.description?.toLowerCase().includes(ql)) return true
    if (cmd.keywords?.some((kw) => kw.toLowerCase().includes(ql))) return true
    return false
  })
})

/** Group filtered commands by category, preserving insertion order.
 *  When query is empty and recents exist, prepend a synthetic 'Recent' group. */
const groupedCommands = computed<Array<{ category: string; commands: Command[] }>>(() => {
  const q = query.value.trim()
  const groups = new Map<string, Command[]>()

  if (!q && recentCommands.value.length > 0) {
    // Synthetic Recent group first
    groups.set('Recent', [...recentCommands.value])
  }

  // Build remaining groups from filteredCommands (non-recent when query empty)
  const recentIdSet = new Set(recentIds.value)
  const commandsToGroup = !q
    ? allCommands.value.filter((cmd) => !recentIdSet.has(cmd.id))
    : filteredCommands.value

  for (const cmd of commandsToGroup) {
    const existing = groups.get(cmd.category)
    if (existing) {
      existing.push(cmd)
    } else {
      groups.set(cmd.category, [cmd])
    }
  }

  return Array.from(groups.entries()).map(([category, commands]) => ({ category, commands }))
})

// ---------------------------------------------------------------------------
// Focus trap
// ---------------------------------------------------------------------------

const trap = createFocusTrap()

watch(
  () => props.open,
  async (visible) => {
    if (visible) {
      // Rebuild commands fresh on each open
      allCommands.value = [...STATIC_COMMANDS, ...buildShortcutCommands()]
      query.value = ''
      selectedIndex.value = 0

      await nextTick()
      // Focus input manually (focusTrap will focus first focusable, which is the input)
      if (dialogRef.value) {
        trap.activate(dialogRef.value, () => emit('close'))
      }
      inputRef.value?.focus()
    } else {
      trap.deactivate()
    }
  },
  { immediate: true },
)

onUnmounted(() => {
  trap.deactivate()
})

// ---------------------------------------------------------------------------
// Keyboard navigation within the modal
// ---------------------------------------------------------------------------

function onInputKeydown(e: KeyboardEvent) {
  const total = filteredCommands.value.length

  if (e.key === 'ArrowDown') {
    e.preventDefault()
    selectedIndex.value = total === 0 ? 0 : (selectedIndex.value + 1) % total
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    selectedIndex.value = total === 0 ? 0 : (selectedIndex.value - 1 + total) % total
  } else if (e.key === 'Enter') {
    e.preventDefault()
    runSelected()
  }
  // Esc is handled by focusTrap → emits close
}

// Reset selectedIndex when query changes so it doesn't overflow
watch(query, () => {
  selectedIndex.value = 0
})

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function runSelected() {
  const cmd = filteredCommands.value[selectedIndex.value]
  if (cmd) {
    pushRecent(cmd.id)
    cmd.handler()
    emit('close')
  }
}

function runCommand(cmd: Command) {
  pushRecent(cmd.id)
  cmd.handler()
  emit('close')
}

// ---------------------------------------------------------------------------
// Flat index helper (category groups → linear index for selectedIndex)
// ---------------------------------------------------------------------------

function flatIndex(cmd: Command): number {
  return filteredCommands.value.indexOf(cmd)
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="cp-overlay"
      @click.self="$emit('close')"
    >
      <div
        ref="dialogRef"
        class="cp-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cp-title"
      >
        <!-- Hidden label for aria -->
        <span id="cp-title" class="cp-sr-only">命令面板</span>

        <!-- Search input -->
        <div class="cp-search-row">
          <span class="cp-search-icon" aria-hidden="true">⌘</span>
          <input
            ref="inputRef"
            v-model="query"
            class="cp-input"
            type="text"
            placeholder="搜尋命令或動作..."
            autocomplete="off"
            spellcheck="false"
            aria-label="搜尋命令"
            @keydown="onInputKeydown"
          />
          <kbd class="cp-esc-hint">Esc</kbd>
        </div>

        <!-- Results list -->
        <div class="cp-results" role="listbox" aria-label="命令清單">
          <template v-if="groupedCommands.length > 0">
            <div
              v-for="group in groupedCommands"
              :key="group.category"
              class="cp-group"
            >
              <div class="cp-group-header">{{ group.category }}</div>
              <button
                v-for="cmd in group.commands"
                :key="cmd.id"
                class="cp-item"
                :class="{ 'cp-item--selected': flatIndex(cmd) === selectedIndex }"
                role="option"
                :aria-selected="flatIndex(cmd) === selectedIndex"
                @click="runCommand(cmd)"
                @mouseenter="selectedIndex = flatIndex(cmd)"
              >
                <span class="cp-item-label">{{ cmd.label }}</span>
                <!-- Shortcut commands render key as kbd badges; others stay plain text -->
                <span
                  v-if="cmd.description && cmd.category === 'Shortcut' && cmd.shortcutKey"
                  class="cp-item-desc cp-item-kbd-combo"
                >
                  <kbd v-if="cmd.shortcutMeta" class="key-badge">⌘</kbd>
                  <kbd v-if="cmd.shortcutCtrl" class="key-badge">Ctrl</kbd>
                  <kbd v-if="cmd.shortcutShift" class="key-badge">⇧</kbd>
                  <kbd v-if="cmd.shortcutAlt" class="key-badge">⌥</kbd>
                  <kbd class="key-badge">{{ cmd.shortcutKey.toUpperCase() }}</kbd>
                </span>
                <span
                  v-else-if="cmd.description"
                  class="cp-item-desc"
                >{{ cmd.description }}</span>
              </button>
            </div>
          </template>

          <p v-else class="cp-empty">
            {{ query.trim() ? `沒有符合「${query}」的命令` : '沒有可用命令' }}
          </p>
        </div>

        <!-- Footer hint -->
        <div class="cp-footer">
          <span class="cp-footer-hint">
            <kbd class="cp-kbd">↑↓</kbd> 移動
            <kbd class="cp-kbd">Enter</kbd> 執行
            <kbd class="cp-kbd">Esc</kbd> 關閉
          </span>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.cp-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.cp-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 6rem 1rem 1rem;
}

.cp-panel {
  background: var(--color-surface, #1e1e2e);
  color: var(--color-text, #cdd6f4);
  border: 1px solid var(--color-border, #313244);
  border-radius: 0.75rem;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.6);
  width: 100%;
  max-width: 600px;
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  outline: none;
}

/* Search row */
.cp-search-row {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--color-border, #313244);
  flex-shrink: 0;
}

.cp-search-icon {
  font-size: 1.1rem;
  opacity: 0.5;
  flex-shrink: 0;
}

.cp-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  font-size: 1rem;
  color: var(--color-text, #cdd6f4);
  caret-color: var(--color-accent, #89b4fa);
}

.cp-input::placeholder {
  color: var(--color-muted, #6c7086);
}

.cp-esc-hint {
  font-size: 0.7rem;
  color: var(--color-muted, #6c7086);
  background: var(--color-surface-raised, #181825);
  border: 1px solid var(--color-border, #313244);
  border-radius: 0.3rem;
  padding: 0.1rem 0.4rem;
  flex-shrink: 0;
  font-family: ui-monospace, 'SFMono-Regular', Menlo, monospace;
}

/* Results */
.cp-results {
  overflow-y: auto;
  flex: 1;
  padding: 0.5rem 0;
}

.cp-group {
  /* group container — no extra padding; items are padded individually */
}

.cp-group-header {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-accent, #89b4fa);
  padding: 0.5rem 1rem 0.25rem;
}

.cp-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 0.5rem 1rem;
  background: none;
  border: none;
  border-radius: 0;
  text-align: left;
  cursor: pointer;
  color: var(--color-text, #cdd6f4);
  transition: background 0.1s;
  gap: 0.5rem;
}

.cp-item:hover,
.cp-item--selected {
  background: var(--color-surface-hover, #313244);
}

.cp-item-label {
  font-size: 0.9rem;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cp-item-desc {
  font-size: 0.8rem;
  color: var(--color-muted, #6c7086);
  flex-shrink: 0;
  white-space: nowrap;
}

.cp-empty {
  font-size: 0.875rem;
  color: var(--color-muted, #6c7086);
  text-align: center;
  padding: 2rem 1rem;
  margin: 0;
}

/* Footer */
.cp-footer {
  padding: 0.5rem 1rem;
  border-top: 1px solid var(--color-border, #313244);
  flex-shrink: 0;
}

.cp-footer-hint {
  font-size: 0.72rem;
  color: var(--color-muted, #6c7086);
  display: flex;
  gap: 0.75rem;
  align-items: center;
}

.cp-kbd {
  display: inline-block;
  background: var(--color-surface-raised, #181825);
  border: 1px solid var(--color-border, #313244);
  border-radius: 0.25rem;
  padding: 0.05rem 0.35rem;
  font-family: ui-monospace, 'SFMono-Regular', Menlo, monospace;
  font-size: 0.7rem;
  color: var(--color-text, #cdd6f4);
  box-shadow: 0 1px 0 var(--color-border, #313244);
}

.cp-item-kbd-combo {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  white-space: nowrap;
}

.key-badge {
  display: inline-block;
  padding: 1px 6px;
  margin: 0 2px;
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: 11px;
  background: var(--bg-muted, rgba(0, 0, 0, 0.06));
  border: 1px solid var(--border-color, rgba(0, 0, 0, 0.15));
  border-radius: 3px;
  line-height: 1.4;
  color: var(--color-text, #cdd6f4);
  white-space: nowrap;
}
</style>
