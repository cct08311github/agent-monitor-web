import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

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
})
