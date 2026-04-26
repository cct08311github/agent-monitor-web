/**
 * keyboardShortcuts.ts — single source of truth for all app keyboard shortcuts.
 *
 * These entries mirror the shortcuts registered at runtime via useKeyboardShortcuts.
 * Keep this file in sync when adding or removing shortcuts elsewhere.
 */

export type ShortcutCategory = '一般' | '導航' | '動作' | '彩蛋'

export interface ShortcutEntry {
  /** One or more key labels to display, e.g. ['?'] or ['⌘', 'K'] */
  keys: readonly string[]
  description: string
  category: ShortcutCategory
}

/**
 * All documented keyboard shortcuts grouped by category.
 *
 * Runtime shortcuts registered via registerShortcut() are also reflected in
 * HelpModal via getShortcuts(). This static list is the canonical
 * human-readable reference used by KeyboardShortcutsHelp.vue.
 */
export const SHORTCUTS: ReadonlyArray<ShortcutEntry> = [
  // ── 一般 ────────────────────────────────────────────────────────────────
  {
    keys: ['?'],
    description: '打開此快捷鍵面板',
    category: '一般',
  },
  {
    keys: ['Esc'],
    description: '關閉面板 / Modal',
    category: '一般',
  },
  {
    keys: ['⌘', 'K'],
    description: '打開命令面板（macOS）',
    category: '一般',
  },
  {
    keys: ['Ctrl', 'K'],
    description: '打開命令面板（Windows / Linux）',
    category: '一般',
  },
  {
    keys: ['⌘', '⇧', 'N'],
    description: 'Quick Capture — 快速記錄想法（macOS）',
    category: '一般',
  },
  {
    keys: ['Ctrl', '⇧', 'N'],
    description: 'Quick Capture — 快速記錄想法（Windows / Linux）',
    category: '一般',
  },
  {
    keys: ['⌘', 'J'],
    description: '最近 agent 快速切換（macOS）',
    category: '導航',
  },
  {
    keys: ['Ctrl', 'J'],
    description: '最近 agent 快速切換（Windows / Linux）',
    category: '導航',
  },
  {
    keys: ['/'],
    description: '聚焦搜尋欄（Logs / TaskHub / Cron）',
    category: '一般',
  },
  // ── 導航 ────────────────────────────────────────────────────────────────
  {
    keys: ['1'],
    description: '切換到 監控 tab',
    category: '導航',
  },
  {
    keys: ['2'],
    description: '切換到 系統 tab',
    category: '導航',
  },
  {
    keys: ['3'],
    description: '切換到 日誌 tab',
    category: '導航',
  },
  {
    keys: ['4'],
    description: '切換到 聊天室 tab',
    category: '導航',
  },
  {
    keys: ['5'],
    description: '切換到 優化 tab',
    category: '導航',
  },
  // ── 動作 ────────────────────────────────────────────────────────────────
  {
    keys: ['⇧', 'P'],
    description: 'Pomodoro 計時器 開/關',
    category: '動作',
  },
  {
    keys: ['⇧', 'D'],
    description: '切換 Compact 密集模式',
    category: '動作',
  },
  {
    keys: ['⇧', 'M'],
    description: 'Ambient mode 開/關',
    category: '動作',
  },
  // ── 彩蛋 ────────────────────────────────────────────────────────────────
  {
    keys: ['↑', '↑', '↓', '↓', '←', '→', '←', '→', 'B', 'A'],
    description: 'Konami Code — 彩蛋',
    category: '彩蛋',
  },
] as const

/**
 * Group a shortcut list by category, preserving insertion order.
 */
export function groupByCategory(
  list: ReadonlyArray<ShortcutEntry>,
): Map<ShortcutCategory, ShortcutEntry[]> {
  const map = new Map<ShortcutCategory, ShortcutEntry[]>()
  for (const entry of list) {
    const existing = map.get(entry.category)
    if (existing) {
      existing.push(entry)
    } else {
      map.set(entry.category, [entry])
    }
  }
  return map
}

/** All distinct categories present in SHORTCUTS, in insertion order. */
export const SHORTCUT_CATEGORIES: ReadonlyArray<ShortcutCategory> = Array.from(
  groupByCategory(SHORTCUTS).keys(),
)
