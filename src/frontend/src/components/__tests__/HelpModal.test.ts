import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

// ---------------------------------------------------------------------------
// Mock useKeyboardShortcuts so the test controls what getShortcuts() returns
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

// createFocusTrap: stub to avoid real DOM focus operations in jsdom
const mockActivate = vi.fn()
const mockDeactivate = vi.fn()

vi.mock('@/lib/focusTrap', () => ({
  createFocusTrap: () => ({
    activate: mockActivate,
    deactivate: mockDeactivate,
  }),
}))

import HelpModal from '../HelpModal.vue'

// HelpModal uses Teleport to body — tests must attach to document.body
// so the teleported content is queryable from wrapper.
const MOUNT_OPTS = { attachTo: document.body }

const SAMPLE_SHORTCUTS = [
  { key: '1', description: '切到 Monitor', category: 'Navigation' },
  { key: '2', description: '切到 System', category: 'Navigation' },
  { key: '?', shift: true, description: '顯示快捷鍵清單', category: 'Actions' },
  { key: 'r', description: 'Refresh data', category: 'Actions' },
]

describe('HelpModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetShortcuts.mockReturnValue(SAMPLE_SHORTCUTS)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // -------------------------------------------------------------------------
  // Visibility
  // -------------------------------------------------------------------------

  it('does not render dialog when open=false', () => {
    const wrapper = mount(HelpModal, { ...MOUNT_OPTS, props: { open: false } })
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('renders dialog when open=true', () => {
    const wrapper = mount(HelpModal, { ...MOUNT_OPTS, props: { open: true } })
    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
    wrapper.unmount()
  })

  // -------------------------------------------------------------------------
  // Accessibility attributes
  // -------------------------------------------------------------------------

  it('has aria-modal="true" and aria-labelledby when open', () => {
    const wrapper = mount(HelpModal, { ...MOUNT_OPTS, props: { open: true } })
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog).not.toBeNull()
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.getAttribute('aria-labelledby')).toBe('help-modal-title')
    wrapper.unmount()
  })

  // -------------------------------------------------------------------------
  // Shortcut list rendering
  // -------------------------------------------------------------------------

  it('displays all registered shortcuts when open', () => {
    const wrapper = mount(HelpModal, { ...MOUNT_OPTS, props: { open: true } })
    const text = document.body.textContent ?? ''
    expect(text).toContain('切到 Monitor')
    expect(text).toContain('切到 System')
    expect(text).toContain('顯示快捷鍵清單')
    wrapper.unmount()
  })

  it('groups shortcuts by category', () => {
    const wrapper = mount(HelpModal, { ...MOUNT_OPTS, props: { open: true } })
    const text = document.body.textContent ?? ''
    expect(text).toContain('Navigation')
    expect(text).toContain('Actions')
    wrapper.unmount()
  })

  it('shows shift modifier in display key', () => {
    const wrapper = mount(HelpModal, { ...MOUNT_OPTS, props: { open: true } })
    // With kbd badge rendering, shift+? renders as separate ⇧ and ? badges
    const badges = Array.from(document.querySelectorAll('kbd.key-badge'))
    const texts = badges.map((b) => b.textContent?.trim())
    expect(texts).toContain('⇧')
    expect(texts).toContain('?')
    wrapper.unmount()
  })

  it('shows empty message when no shortcuts registered', () => {
    mockGetShortcuts.mockReturnValue([])
    const wrapper = mount(HelpModal, { ...MOUNT_OPTS, props: { open: true } })
    expect(document.body.textContent).toContain('目前沒有已註冊的快捷鍵')
    wrapper.unmount()
  })

  // -------------------------------------------------------------------------
  // Close events
  // -------------------------------------------------------------------------

  it('emits close when close button is clicked', async () => {
    const wrapper = mount(HelpModal, { ...MOUNT_OPTS, props: { open: true } })
    const closeBtn = document.querySelector('.help-close-btn') as HTMLElement
    expect(closeBtn).not.toBeNull()
    closeBtn.click()
    await flushPromises()
    expect(wrapper.emitted('close')).toBeTruthy()
    wrapper.unmount()
  })

  it('emits close when overlay background is clicked', async () => {
    const wrapper = mount(HelpModal, { ...MOUNT_OPTS, props: { open: true } })
    // Click the overlay itself (not the inner dialog)
    const overlay = document.querySelector('.help-overlay') as HTMLElement
    expect(overlay).not.toBeNull()
    // Simulate click.self by dispatching click on overlay and the component checks event.target
    overlay.click()
    await flushPromises()
    expect(wrapper.emitted('close')).toBeTruthy()
    wrapper.unmount()
  })

  // -------------------------------------------------------------------------
  // Focus trap
  // -------------------------------------------------------------------------

  it('activates focus trap when open becomes true', async () => {
    const wrapper = mount(HelpModal, { ...MOUNT_OPTS, props: { open: false } })
    await wrapper.setProps({ open: true })
    await flushPromises()
    expect(mockActivate).toHaveBeenCalled()
    wrapper.unmount()
  })

  it('deactivates focus trap when open becomes false', async () => {
    const wrapper = mount(HelpModal, { ...MOUNT_OPTS, props: { open: true } })
    await flushPromises()
    await wrapper.setProps({ open: false })
    await flushPromises()
    expect(mockDeactivate).toHaveBeenCalled()
    wrapper.unmount()
  })

  it('deactivates focus trap on unmount', () => {
    const wrapper = mount(HelpModal, { ...MOUNT_OPTS, props: { open: true } })
    wrapper.unmount()
    expect(mockDeactivate).toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // Search filter — Issue #373
  // -------------------------------------------------------------------------

  it('renders search input when modal is open', () => {
    const wrapper = mount(HelpModal, { ...MOUNT_OPTS, props: { open: true } })
    const input = document.querySelector('.help-search-input') as HTMLInputElement
    expect(input).not.toBeNull()
    expect(input.placeholder).toBe('搜尋 shortcut...')
    wrapper.unmount()
  })

  it('filters shortcuts by description when user types', async () => {
    const wrapper = mount(HelpModal, { ...MOUNT_OPTS, props: { open: true } })
    const input = document.querySelector('.help-search-input') as HTMLInputElement
    expect(input).not.toBeNull()
    // Trigger input with value matching only one shortcut description
    input.value = 'Monitor'
    input.dispatchEvent(new Event('input'))
    await flushPromises()
    const text = document.body.textContent ?? ''
    expect(text).toContain('切到 Monitor')
    expect(text).not.toContain('切到 System')
    wrapper.unmount()
  })

  it('filters shortcuts by key when user types', async () => {
    const wrapper = mount(HelpModal, { ...MOUNT_OPTS, props: { open: true } })
    const input = document.querySelector('.help-search-input') as HTMLInputElement
    expect(input).not.toBeNull()
    // Key "1" should match Navigation shortcut with key "1"
    input.value = '1'
    input.dispatchEvent(new Event('input'))
    await flushPromises()
    const text = document.body.textContent ?? ''
    expect(text).toContain('切到 Monitor')
    // key "2" shortcut should not appear
    expect(text).not.toContain('切到 System')
    wrapper.unmount()
  })

  it('filters shortcuts by description case-insensitively', async () => {
    const wrapper = mount(HelpModal, { ...MOUNT_OPTS, props: { open: true } })
    const input = document.querySelector('.help-search-input') as HTMLInputElement
    expect(input).not.toBeNull()
    // Lowercase search for uppercase "Refresh"
    input.value = 'refresh'
    input.dispatchEvent(new Event('input'))
    await flushPromises()
    const text = document.body.textContent ?? ''
    expect(text).toContain('Refresh data')
    expect(text).not.toContain('切到 Monitor')
    wrapper.unmount()
  })

  it('shows all shortcuts when search query is empty', async () => {
    const wrapper = mount(HelpModal, { ...MOUNT_OPTS, props: { open: true } })
    const input = document.querySelector('.help-search-input') as HTMLInputElement
    expect(input).not.toBeNull()
    // Type something then clear
    input.value = 'xyz'
    input.dispatchEvent(new Event('input'))
    await flushPromises()
    input.value = ''
    input.dispatchEvent(new Event('input'))
    await flushPromises()
    const text = document.body.textContent ?? ''
    expect(text).toContain('切到 Monitor')
    expect(text).toContain('切到 System')
    expect(text).toContain('Refresh data')
    wrapper.unmount()
  })

  it('shows no-match message when search query has no results', async () => {
    const wrapper = mount(HelpModal, { ...MOUNT_OPTS, props: { open: true } })
    const input = document.querySelector('.help-search-input') as HTMLInputElement
    expect(input).not.toBeNull()
    input.value = 'zzznomatch999'
    input.dispatchEvent(new Event('input'))
    await flushPromises()
    const text = document.body.textContent ?? ''
    expect(text).toContain('無符合 shortcut')
    wrapper.unmount()
  })

  it('shows Cmd+K hint in footer', () => {
    const wrapper = mount(HelpModal, { ...MOUNT_OPTS, props: { open: true } })
    const text = document.body.textContent ?? ''
    expect(text).toContain('⌘K')
    expect(text).toContain('Ctrl+K')
    expect(text).toContain('Command Palette')
    wrapper.unmount()
  })

  it('resets search query when modal reopens', async () => {
    const wrapper = mount(HelpModal, { ...MOUNT_OPTS, props: { open: true } })
    const input = document.querySelector('.help-search-input') as HTMLInputElement
    input.value = 'something'
    input.dispatchEvent(new Event('input'))
    await flushPromises()
    // Close then reopen
    await wrapper.setProps({ open: false })
    await flushPromises()
    await wrapper.setProps({ open: true })
    await flushPromises()
    const freshInput = document.querySelector('.help-search-input') as HTMLInputElement
    expect(freshInput.value).toBe('')
    wrapper.unmount()
  })
})

// ---------------------------------------------------------------------------
// kbd badge rendering — Issue #410
// Isolated describe to avoid Teleport DOM accumulation affecting other tests
// ---------------------------------------------------------------------------

function cleanBody() {
  // Remove all child nodes from body (safe: no user content, test-only cleanup)
  while (document.body.firstChild) {
    document.body.removeChild(document.body.firstChild)
  }
}

describe('HelpModal — kbd badge rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetShortcuts.mockReturnValue(SAMPLE_SHORTCUTS)
    cleanBody()
  })

  afterEach(() => {
    cleanBody()
    vi.clearAllMocks()
  })

  it('renders <kbd class="key-badge"> elements for each shortcut key', () => {
    const wrapper = mount(HelpModal, { ...MOUNT_OPTS, props: { open: true } })
    // SAMPLE_SHORTCUTS has 4 entries → at least 4 key-badge elements (one main key each)
    const badges = document.querySelectorAll('kbd.key-badge')
    expect(badges.length).toBeGreaterThanOrEqual(4)
    wrapper.unmount()
  })

  it('renders separate <kbd> badges for modifier and main key in a combo shortcut', () => {
    // SAMPLE_SHORTCUTS includes { key: '?', shift: true, ... }
    // Expect both a ⇧ badge and a ? badge to appear as separate elements
    const wrapper = mount(HelpModal, { ...MOUNT_OPTS, props: { open: true } })
    const badges = Array.from(document.querySelectorAll('kbd.key-badge'))
    const texts = badges.map((b) => b.textContent?.trim())
    expect(texts).toContain('⇧')
    expect(texts).toContain('?')
    wrapper.unmount()
  })

  it('renders meta (⌘) badge when shortcut has meta modifier', () => {
    mockGetShortcuts.mockReturnValue([
      { key: 'k', meta: true, description: 'Command Palette', category: 'General' },
    ])
    const wrapper = mount(HelpModal, { ...MOUNT_OPTS, props: { open: true } })
    const badges = Array.from(document.querySelectorAll('kbd.key-badge'))
    const texts = badges.map((b) => b.textContent?.trim())
    expect(texts).toContain('⌘')
    expect(texts).toContain('K')
    wrapper.unmount()
  })
})
