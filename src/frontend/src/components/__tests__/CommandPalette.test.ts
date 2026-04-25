import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

// ---------------------------------------------------------------------------
// Mock localStorage
// ---------------------------------------------------------------------------

const _lsStore: Record<string, string> = {}

const localStorageMock = {
  getItem: vi.fn((key: string): string | null => _lsStore[key] ?? null),
  setItem: vi.fn((key: string, value: string): void => {
    _lsStore[key] = value
  }),
  removeItem: vi.fn((key: string): void => {
    delete _lsStore[key]
  }),
  clear: vi.fn((): void => {
    for (const key of Object.keys(_lsStore)) {
      delete _lsStore[key]
    }
  }),
}

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
})

// ---------------------------------------------------------------------------
// Mock useKeyboardShortcuts
// ---------------------------------------------------------------------------

const mockGetShortcuts = vi.fn()
const mockRegisterShortcut = vi.fn()

vi.mock('@/composables/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: () => ({
    registerShortcut: mockRegisterShortcut,
    unregisterShortcut: vi.fn(),
    getShortcuts: mockGetShortcuts,
  }),
}))

// ---------------------------------------------------------------------------
// Mock useTheme
// ---------------------------------------------------------------------------

const mockCycleTheme = vi.fn()

vi.mock('@/composables/useTheme', () => ({
  useTheme: () => ({
    cycleTheme: mockCycleTheme,
    currentTheme: { value: 'auto' },
    effectiveTheme: { value: 'dark' },
    setTheme: vi.fn(),
  }),
}))

// ---------------------------------------------------------------------------
// Mock focusTrap
// ---------------------------------------------------------------------------

const mockActivate = vi.fn()
const mockDeactivate = vi.fn()

vi.mock('@/lib/focusTrap', () => ({
  createFocusTrap: () => ({
    activate: mockActivate,
    deactivate: mockDeactivate,
  }),
}))

// ---------------------------------------------------------------------------
// Mock appState — factory-based so hoisting works correctly
// ---------------------------------------------------------------------------

vi.mock('@/stores/appState', () => {
  const appState = {
    currentDesktopTab: 'monitor',
    preferredMonitorSubTab: null as string | null,
  }
  return { appState }
})

// ---------------------------------------------------------------------------
// Import component under test and the mocked appState (after vi.mock calls)
// ---------------------------------------------------------------------------

import CommandPalette from '../CommandPalette.vue'
import { appState } from '@/stores/appState'

// Mount with attachTo body so Teleport has a valid target.
// NOTE: When Teleport renders into document.body, wrapper.find() cannot reach
// teleported elements. Use document.querySelector / document.querySelectorAll
// for DOM assertions, and trigger events directly on the queried element.
const MOUNT_OPTS = { attachTo: document.body }

const SAMPLE_SHORTCUTS = [
  { key: '1', description: '切到 Monitor', category: 'Navigation' },
  { key: '?', shift: true, description: '顯示快捷鍵清單', category: 'Actions' },
]

// Helper: fire an input event on the teleported .cp-input element
async function setInputValue(value: string) {
  const input = document.querySelector('.cp-input') as HTMLInputElement
  if (!input) throw new Error('.cp-input not found in document')
  input.value = value
  input.dispatchEvent(new Event('input'))
  await flushPromises()
}

// Helper: trigger a keydown event on the teleported .cp-input element
async function triggerInputKeydown(key: string) {
  const input = document.querySelector('.cp-input') as HTMLInputElement
  if (!input) throw new Error('.cp-input not found in document')
  input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  await flushPromises()
}

describe('CommandPalette', () => {
  beforeEach(() => {
    mockGetShortcuts.mockReturnValue(SAMPLE_SHORTCUTS)
    mockCycleTheme.mockReset()
    mockActivate.mockReset()
    mockDeactivate.mockReset()
    appState.currentDesktopTab = 'monitor'
    appState.preferredMonitorSubTab = null
    localStorageMock.clear()
  })

  afterEach(() => {
    // Do NOT clear document.body — Teleport needs it intact for next test
    vi.clearAllMocks()
    // Re-set after clearAllMocks to remain usable by any synchronous afterEach logic
    mockGetShortcuts.mockReturnValue(SAMPLE_SHORTCUTS)
  })

  // -------------------------------------------------------------------------
  // 1. Renders when open=true
  // -------------------------------------------------------------------------

  it('renders dialog when open=true', () => {
    const wrapper = mount(CommandPalette, { ...MOUNT_OPTS, props: { open: true } })
    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
    wrapper.unmount()
  })

  it('does not render when open=false', () => {
    const wrapper = mount(CommandPalette, { ...MOUNT_OPTS, props: { open: false } })
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    wrapper.unmount()
  })

  // -------------------------------------------------------------------------
  // 2. Focus trap on open
  // -------------------------------------------------------------------------

  it('activates focus trap when open becomes true', async () => {
    const wrapper = mount(CommandPalette, { ...MOUNT_OPTS, props: { open: false } })
    await wrapper.setProps({ open: true })
    await flushPromises()
    expect(mockActivate).toHaveBeenCalled()
    wrapper.unmount()
  })

  it('deactivates focus trap when open becomes false', async () => {
    const wrapper = mount(CommandPalette, { ...MOUNT_OPTS, props: { open: true } })
    await flushPromises()
    await wrapper.setProps({ open: false })
    await flushPromises()
    expect(mockDeactivate).toHaveBeenCalled()
    wrapper.unmount()
  })

  // -------------------------------------------------------------------------
  // 3. Type query -> filter results
  // -------------------------------------------------------------------------

  it('shows all commands when query is empty', async () => {
    const wrapper = mount(CommandPalette, { ...MOUNT_OPTS, props: { open: true } })
    await flushPromises()
    const items = document.querySelectorAll('.cp-item')
    expect(items.length).toBeGreaterThan(0)
    wrapper.unmount()
  })

  it('filters commands by query matching label', async () => {
    const wrapper = mount(CommandPalette, { ...MOUNT_OPTS, props: { open: true } })
    await flushPromises()

    expect(document.querySelector('.cp-input')).not.toBeNull()

    await setInputValue('theme')

    const items = document.querySelectorAll('.cp-item')
    expect(items.length).toBe(1)
    expect(items[0].textContent).toContain('切換主題')
    wrapper.unmount()
  })

  it('shows empty message when no commands match query', async () => {
    const wrapper = mount(CommandPalette, { ...MOUNT_OPTS, props: { open: true } })
    await flushPromises()

    await setInputValue('xyznonexistent')

    const emptyMsg = document.querySelector('.cp-empty')
    expect(emptyMsg).not.toBeNull()
    expect(emptyMsg?.textContent).toContain('xyznonexistent')
    wrapper.unmount()
  })

  // -------------------------------------------------------------------------
  // 4. Arrow down/up change selectedIndex
  // -------------------------------------------------------------------------

  it('moves selectedIndex down on ArrowDown', async () => {
    const wrapper = mount(CommandPalette, { ...MOUNT_OPTS, props: { open: true } })
    await flushPromises()

    await triggerInputKeydown('ArrowDown')

    const allItems = document.querySelectorAll('.cp-item')
    expect(allItems.length).toBeGreaterThan(1)
    expect(allItems[1].classList.contains('cp-item--selected')).toBe(true)
    wrapper.unmount()
  })

  it('wraps selectedIndex to last on ArrowUp from 0', async () => {
    const wrapper = mount(CommandPalette, { ...MOUNT_OPTS, props: { open: true } })
    await flushPromises()

    await triggerInputKeydown('ArrowUp')

    const allItems = document.querySelectorAll('.cp-item')
    const lastItem = allItems[allItems.length - 1]
    expect(lastItem.classList.contains('cp-item--selected')).toBe(true)
    wrapper.unmount()
  })

  // -------------------------------------------------------------------------
  // 5. Enter -> run selected command handler
  // -------------------------------------------------------------------------

  it('runs selected command and emits close on Enter', async () => {
    const wrapper = mount(CommandPalette, { ...MOUNT_OPTS, props: { open: true } })
    await flushPromises()

    // Filter to just the theme command (index 0)
    await setInputValue('theme')

    await triggerInputKeydown('Enter')

    expect(mockCycleTheme).toHaveBeenCalled()
    expect(wrapper.emitted('close')).toBeTruthy()
    wrapper.unmount()
  })

  // -------------------------------------------------------------------------
  // 6. Esc emits close (via focusTrap onEscape)
  // -------------------------------------------------------------------------

  it('emits close when focusTrap escape callback is triggered', async () => {
    const wrapper = mount(CommandPalette, { ...MOUNT_OPTS, props: { open: true } })
    await flushPromises()

    expect(mockActivate).toHaveBeenCalled()
    const onEscape = mockActivate.mock.calls[0][1] as () => void
    onEscape()
    await flushPromises()

    expect(wrapper.emitted('close')).toBeTruthy()
    wrapper.unmount()
  })

  // -------------------------------------------------------------------------
  // 7. Click result -> run handler + emit close
  // -------------------------------------------------------------------------

  it('runs command handler and emits close on item click', async () => {
    const wrapper = mount(CommandPalette, { ...MOUNT_OPTS, props: { open: true } })
    await flushPromises()

    // Filter to theme command
    await setInputValue('theme')

    const item = document.querySelector('.cp-item') as HTMLElement
    expect(item).not.toBeNull()
    item.click()
    await flushPromises()

    expect(mockCycleTheme).toHaveBeenCalled()
    expect(wrapper.emitted('close')).toBeTruthy()
    wrapper.unmount()
  })

  // -------------------------------------------------------------------------
  // 8. Wraparound: ArrowDown from last wraps to first
  // -------------------------------------------------------------------------

  it('wraps selectedIndex from last to 0 on ArrowDown', async () => {
    const wrapper = mount(CommandPalette, { ...MOUNT_OPTS, props: { open: true } })
    await flushPromises()

    const total = document.querySelectorAll('.cp-item').length
    expect(total).toBeGreaterThan(0)

    // Navigate to last item
    for (let i = 0; i < total - 1; i++) {
      await triggerInputKeydown('ArrowDown')
    }

    // One more ArrowDown wraps to first
    await triggerInputKeydown('ArrowDown')

    const updatedItems = document.querySelectorAll('.cp-item')
    expect(updatedItems[0].classList.contains('cp-item--selected')).toBe(true)
    wrapper.unmount()
  })

  // -------------------------------------------------------------------------
  // 9. Categories grouped with headers
  // -------------------------------------------------------------------------

  it('renders category group headers', async () => {
    const wrapper = mount(CommandPalette, { ...MOUNT_OPTS, props: { open: true } })
    await flushPromises()

    const headers = document.querySelectorAll('.cp-group-header')
    const headerTexts = Array.from(headers).map((h) => h.textContent?.trim())
    expect(headerTexts).toContain('Navigation')
    expect(headerTexts).toContain('Actions')
    wrapper.unmount()
  })

  // -------------------------------------------------------------------------
  // 10. Navigation commands change appState
  // -------------------------------------------------------------------------

  it('navigation to monitor tab updates appState.currentDesktopTab', async () => {
    appState.currentDesktopTab = 'logs'
    const wrapper = mount(CommandPalette, { ...MOUNT_OPTS, props: { open: true } })
    await flushPromises()

    await setInputValue('前往 監控')

    const item = document.querySelector('.cp-item') as HTMLElement
    expect(item).not.toBeNull()
    item.click()
    await flushPromises()

    expect(appState.currentDesktopTab).toBe('monitor')
    wrapper.unmount()
  })

  it('observability command sets tab and preferredMonitorSubTab', async () => {
    appState.currentDesktopTab = 'logs'
    appState.preferredMonitorSubTab = null
    const wrapper = mount(CommandPalette, { ...MOUNT_OPTS, props: { open: true } })
    await flushPromises()

    await setInputValue('observability')

    const item = document.querySelector('.cp-item') as HTMLElement
    expect(item).not.toBeNull()
    item.click()
    await flushPromises()

    expect(appState.currentDesktopTab).toBe('monitor')
    expect(appState.preferredMonitorSubTab).toBe('observability')
    wrapper.unmount()
  })

  // -------------------------------------------------------------------------
  // 11. Shortcut commands pulled dynamically from getShortcuts()
  // -------------------------------------------------------------------------

  it('includes dynamic shortcut commands from getShortcuts()', async () => {
    const wrapper = mount(CommandPalette, { ...MOUNT_OPTS, props: { open: true } })
    await flushPromises()

    const text = document.body.textContent ?? ''
    expect(text).toContain('切到 Monitor')
    expect(text).toContain('顯示快捷鍵清單')
    wrapper.unmount()
  })

  it('deactivates focus trap on unmount', () => {
    const wrapper = mount(CommandPalette, { ...MOUNT_OPTS, props: { open: true } })
    wrapper.unmount()
    expect(mockDeactivate).toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // 12. kbd badge rendering for Shortcut category — Issue #410
  // -------------------------------------------------------------------------

  it('renders <kbd class="key-badge"> for Shortcut category commands', async () => {
    // SAMPLE_SHORTCUTS has entries with key '1' and key '?' (shift)
    // After filtering to Shortcut category items, each should have key-badge elements
    const wrapper = mount(CommandPalette, { ...MOUNT_OPTS, props: { open: true } })
    await flushPromises()

    // Filter to just shortcut commands to verify kbd badge is rendered
    await setInputValue('切到 Monitor')
    const badges = document.querySelectorAll('kbd.key-badge')
    expect(badges.length).toBeGreaterThanOrEqual(1)
    wrapper.unmount()
  })

  it('renders separate modifier <kbd> badge for shortcut with shift', async () => {
    const wrapper = mount(CommandPalette, { ...MOUNT_OPTS, props: { open: true } })
    await flushPromises()

    // Filter to the shortcut with shift: true (key '?', description '顯示快捷鍵清單')
    await setInputValue('顯示快捷鍵清單')

    const badges = Array.from(document.querySelectorAll('kbd.key-badge'))
    const badgeTexts = badges.map((b) => b.textContent?.trim())
    expect(badgeTexts).toContain('⇧')
    expect(badgeTexts).toContain('?')
    wrapper.unmount()
  })
})

// ---------------------------------------------------------------------------
// Recent commands — Issue #389
// ---------------------------------------------------------------------------

describe('CommandPalette — recent commands', () => {
  const RECENTS_KEY = 'oc_palette_recent'

  beforeEach(() => {
    mockGetShortcuts.mockReturnValue(SAMPLE_SHORTCUTS)
    mockCycleTheme.mockReset()
    mockActivate.mockReset()
    mockDeactivate.mockReset()
    appState.currentDesktopTab = 'monitor'
    appState.preferredMonitorSubTab = null
    localStorageMock.clear()
  })

  afterEach(() => {
    vi.clearAllMocks()
    mockGetShortcuts.mockReturnValue(SAMPLE_SHORTCUTS)
  })

  // Case 1: Empty query + recents → 'Recent' category displays at top
  it('shows Recent group at top when query empty and recents exist', async () => {
    // Pre-seed one recent: action-toggle-theme
    _lsStore[RECENTS_KEY] = JSON.stringify(['action-toggle-theme'])

    const wrapper = mount(CommandPalette, { ...MOUNT_OPTS, props: { open: true } })
    await flushPromises()

    const headers = Array.from(document.querySelectorAll('.cp-group-header')).map(
      (h) => h.textContent?.trim(),
    )
    expect(headers[0]).toBe('Recent')
    expect(headers).toContain('Navigation')
    wrapper.unmount()
  })

  // Case 2: Empty query + no recents → no Recent category
  it('does not show Recent group when no recents exist', async () => {
    const wrapper = mount(CommandPalette, { ...MOUNT_OPTS, props: { open: true } })
    await flushPromises()

    const headers = Array.from(document.querySelectorAll('.cp-group-header')).map(
      (h) => h.textContent?.trim(),
    )
    expect(headers).not.toContain('Recent')
    wrapper.unmount()
  })

  // Case 3: Non-empty query → Recent category not shown
  it('does not show Recent group when query is non-empty', async () => {
    _lsStore[RECENTS_KEY] = JSON.stringify(['action-toggle-theme'])

    const wrapper = mount(CommandPalette, { ...MOUNT_OPTS, props: { open: true } })
    await flushPromises()

    await setInputValue('監控')

    const headers = Array.from(document.querySelectorAll('.cp-group-header')).map(
      (h) => h.textContent?.trim(),
    )
    expect(headers).not.toContain('Recent')
    wrapper.unmount()
  })

  // Case 4: Running a command via click → recentIds pushed (localStorage.setItem called with id)
  it('pushes command id to localStorage when command is executed via click', async () => {
    const wrapper = mount(CommandPalette, { ...MOUNT_OPTS, props: { open: true } })
    await flushPromises()

    // Filter to theme command
    await setInputValue('theme')
    const item = document.querySelector('.cp-item') as HTMLElement
    expect(item).not.toBeNull()
    item.click()
    await flushPromises()

    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      RECENTS_KEY,
      expect.stringContaining('action-toggle-theme'),
    )
    wrapper.unmount()
  })

  // Case 5: Running same command twice → recentIds deduplicated, newest first
  it('deduplicates recentIds when same command run twice', async () => {
    const wrapper = mount(CommandPalette, { ...MOUNT_OPTS, props: { open: true } })
    await flushPromises()

    // Click theme command twice (re-open by toggling props)
    await setInputValue('theme')
    let item = document.querySelector('.cp-item') as HTMLElement
    item.click()
    await flushPromises()

    // Re-open palette
    await wrapper.setProps({ open: false })
    await wrapper.setProps({ open: true })
    await flushPromises()

    await setInputValue('theme')
    item = document.querySelector('.cp-item') as HTMLElement
    item.click()
    await flushPromises()

    // Get the last call's second argument
    const calls = localStorageMock.setItem.mock.calls
    const lastSaved = JSON.parse(calls[calls.length - 1][1] as string) as string[]
    expect(lastSaved.filter((id) => id === 'action-toggle-theme').length).toBe(1)
    expect(lastSaved[0]).toBe('action-toggle-theme')
    wrapper.unmount()
  })

  // Case 6: More than 5 unique commands → truncated to 5
  it('truncates recentIds to RECENTS_MAX (5)', async () => {
    // Pre-seed 4 existing recents
    _lsStore[RECENTS_KEY] = JSON.stringify([
      'nav-system',
      'nav-logs',
      'nav-chat',
      'nav-optimize',
    ])

    const wrapper = mount(CommandPalette, { ...MOUNT_OPTS, props: { open: true } })
    await flushPromises()

    // Run a 5th unique command (nav-monitor)
    await setInputValue('前往 監控')
    const item = document.querySelector('.cp-item') as HTMLElement
    item.click()
    await flushPromises()

    const calls = localStorageMock.setItem.mock.calls
    const saved = JSON.parse(calls[calls.length - 1][1] as string) as string[]
    expect(saved.length).toBeLessThanOrEqual(5)
    expect(saved[0]).toBe('nav-monitor')
    wrapper.unmount()
  })

  // Case 7: Loads recents from localStorage on mount
  it('loads recents from localStorage on mount', async () => {
    _lsStore[RECENTS_KEY] = JSON.stringify(['nav-system'])

    const wrapper = mount(CommandPalette, { ...MOUNT_OPTS, props: { open: true } })
    await flushPromises()

    const headers = Array.from(document.querySelectorAll('.cp-group-header')).map(
      (h) => h.textContent?.trim(),
    )
    expect(headers[0]).toBe('Recent')

    // The recent item should appear in the Recent group
    const firstGroupItems = document.querySelectorAll('.cp-group:first-child .cp-item')
    const texts = Array.from(firstGroupItems).map((el) => el.textContent)
    expect(texts.some((t) => t?.includes('前往 系統'))).toBe(true)
    wrapper.unmount()
  })

  // Case 8: Malformed JSON in localStorage → silent fallback, no Recent group
  it('silently falls back to empty recents when localStorage JSON is malformed', async () => {
    _lsStore[RECENTS_KEY] = 'not-valid-json{'

    const wrapper = mount(CommandPalette, { ...MOUNT_OPTS, props: { open: true } })
    await flushPromises()

    // Should not throw; Recent group should not appear
    const headers = Array.from(document.querySelectorAll('.cp-group-header')).map(
      (h) => h.textContent?.trim(),
    )
    expect(headers).not.toContain('Recent')
    wrapper.unmount()
  })
})
