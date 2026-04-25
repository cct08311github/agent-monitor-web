import { describe, it, expect } from 'vitest'
import {
  SHORTCUTS,
  SHORTCUT_CATEGORIES,
  groupByCategory,
  type ShortcutCategory,
  type ShortcutEntry,
} from '../keyboardShortcuts'

describe('SHORTCUTS data', () => {
  it('contains a "?" entry for opening the cheatsheet panel', () => {
    const entry = SHORTCUTS.find((s) => s.keys.includes('?'))
    expect(entry).toBeDefined()
    expect(entry?.category).toBe<ShortcutCategory>('一般')
  })

  it('contains an "Esc" entry for closing panels', () => {
    const entry = SHORTCUTS.find((s) => s.keys.includes('Esc'))
    expect(entry).toBeDefined()
    expect(entry?.category).toBe<ShortcutCategory>('一般')
  })

  it('contains a Cmd+K (⌘ K) entry for the command palette', () => {
    const entry = SHORTCUTS.find((s) => s.keys.includes('⌘') && s.keys.includes('K'))
    expect(entry).toBeDefined()
    expect(entry?.category).toBe<ShortcutCategory>('一般')
  })

  it('contains Ctrl+K entry for the command palette (Windows/Linux)', () => {
    const entry = SHORTCUTS.find((s) => s.keys.includes('Ctrl') && s.keys.includes('K'))
    expect(entry).toBeDefined()
    expect(entry?.category).toBe<ShortcutCategory>('一般')
  })

  it('has all entries with non-empty keys array and description', () => {
    for (const entry of SHORTCUTS) {
      expect(entry.keys.length).toBeGreaterThan(0)
      expect(entry.description.trim().length).toBeGreaterThan(0)
    }
  })

  it('has all entries with a valid ShortcutCategory', () => {
    const validCategories: ReadonlyArray<ShortcutCategory> = ['一般', '導航', '動作', '彩蛋']
    for (const entry of SHORTCUTS) {
      expect(validCategories).toContain(entry.category)
    }
  })

  it('contains navigation shortcuts for tabs 1 through 5', () => {
    const navKeys = SHORTCUTS.filter((s) => s.category === '導航').flatMap((s) => s.keys)
    for (const num of ['1', '2', '3', '4', '5']) {
      expect(navKeys).toContain(num)
    }
  })

  it('contains action shortcuts for Pomodoro, Compact and Ambient', () => {
    const actions = SHORTCUTS.filter((s) => s.category === '動作')
    const descs = actions.map((s) => s.description)
    expect(descs.some((d) => d.includes('Pomodoro'))).toBe(true)
    expect(descs.some((d) => d.includes('Compact'))).toBe(true)
    expect(descs.some((d) => d.includes('Ambient'))).toBe(true)
  })
})

describe('groupByCategory', () => {
  it('returns a Map with all expected categories', () => {
    const map = groupByCategory(SHORTCUTS)
    const categories = Array.from(map.keys())
    expect(categories).toContain<ShortcutCategory>('一般')
    expect(categories).toContain<ShortcutCategory>('導航')
    expect(categories).toContain<ShortcutCategory>('動作')
    expect(categories).toContain<ShortcutCategory>('彩蛋')
  })

  it('assigns each entry to the correct category bucket', () => {
    const map = groupByCategory(SHORTCUTS)
    const general = map.get('一般') ?? []
    expect(general.some((e) => e.keys.includes('?'))).toBe(true)
    const nav = map.get('導航') ?? []
    expect(nav.some((e) => e.keys.includes('1'))).toBe(true)
  })

  it('preserves all entries — total count unchanged', () => {
    const map = groupByCategory(SHORTCUTS)
    const total = Array.from(map.values()).reduce((acc, arr) => acc + arr.length, 0)
    expect(total).toBe(SHORTCUTS.length)
  })

  it('works on a custom list', () => {
    const custom: ShortcutEntry[] = [
      { keys: ['A'], description: 'Test A', category: '一般' },
      { keys: ['B'], description: 'Test B', category: '導航' },
      { keys: ['C'], description: 'Test C', category: '一般' },
    ]
    const map = groupByCategory(custom)
    expect(map.get('一般')?.length).toBe(2)
    expect(map.get('導航')?.length).toBe(1)
    expect(map.has('動作')).toBe(false)
  })
})

describe('SHORTCUT_CATEGORIES', () => {
  it('contains all expected categories', () => {
    expect(SHORTCUT_CATEGORIES).toContain<ShortcutCategory>('一般')
    expect(SHORTCUT_CATEGORIES).toContain<ShortcutCategory>('導航')
    expect(SHORTCUT_CATEGORIES).toContain<ShortcutCategory>('動作')
    expect(SHORTCUT_CATEGORIES).toContain<ShortcutCategory>('彩蛋')
  })

  it('has no duplicate categories', () => {
    const unique = new Set(SHORTCUT_CATEGORIES)
    expect(unique.size).toBe(SHORTCUT_CATEGORIES.length)
  })
})
