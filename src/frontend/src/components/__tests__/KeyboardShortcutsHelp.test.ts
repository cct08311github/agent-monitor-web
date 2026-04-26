import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

// ---------------------------------------------------------------------------
// Shared isOpen ref — must be declared at module scope so the factory closure
// and the test code share the same reference.
// ---------------------------------------------------------------------------

const isOpen = ref(false)

vi.mock('@/composables/useKeyboardShortcutsHelp', () => ({
  useKeyboardShortcutsHelp: () => ({
    isOpen,
    open: () => { isOpen.value = true },
    close: () => { isOpen.value = false },
  }),
}))

vi.mock('@/lib/focusTrap', () => ({
  createFocusTrap: () => ({
    activate: vi.fn(),
    deactivate: vi.fn(),
  }),
}))

// Stub footer composables to avoid side-effects in tests
vi.mock('@/composables/useOnboardingTour', () => ({ useOnboardingTour: () => ({ restart: vi.fn() }) }))
vi.mock('@/composables/useQuietHoursSetting', () => ({ useQuietHoursSetting: () => ({ open: vi.fn() }) }))
vi.mock('@/composables/useColorPalette', () => ({ useColorPalette: () => ({ isCbSafe: () => false, togglePalette: vi.fn() }) }))
vi.mock('@/composables/useToast', () => ({ useToast: () => ({ success: vi.fn(), info: vi.fn(), warning: vi.fn() }) }))
vi.mock('@/composables/useWhatsNew', () => ({ useWhatsNew: () => ({ open: vi.fn() }) }))
vi.mock('@/composables/useSoundEffect', () => ({ useSoundEffect: () => ({ isEnabled: ref(false), toggle: vi.fn() }) }))
vi.mock('@/composables/useTimezone', () => ({ useTimezone: () => ({ mode: ref('local'), toggle: vi.fn() }) }))
vi.mock('@/composables/useWorkspaceMenu', () => ({ useWorkspaceMenu: () => ({ open: vi.fn() }) }))
vi.mock('@/composables/useQuickCapture', () => ({ useQuickCapture: () => ({ openList: vi.fn(), captures: ref([]) }) }))
vi.mock('@/composables/useThemeScheduleSetting', () => ({ useThemeScheduleSetting: () => ({ open: vi.fn() }) }))
vi.mock('@/composables/useDesktopNotify', () => ({
  useDesktopNotify: () => ({
    enabled: ref(false),
    permission: ref('default'),
    isUnsupported: ref(false),
    toggle: vi.fn().mockResolvedValue({ ok: true }),
  }),
}))

import KeyboardShortcutsHelp from '../KeyboardShortcutsHelp.vue'

const MOUNT_OPTS = { attachTo: document.body }

function cleanBody() {
  while (document.body.firstChild) {
    document.body.removeChild(document.body.firstChild)
  }
}

describe('KeyboardShortcutsHelp — search', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    cleanBody()
    isOpen.value = false
  })

  afterEach(() => {
    isOpen.value = false
    cleanBody()
    vi.clearAllMocks()
  })

  // -------------------------------------------------------------------------
  // 1. Modal opens with query empty → all shortcuts visible
  // -------------------------------------------------------------------------
  it('opens with empty query and shows all shortcuts', async () => {
    const wrapper = mount(KeyboardShortcutsHelp, MOUNT_OPTS)
    isOpen.value = true
    await flushPromises()

    const input = document.querySelector('.ksh-search') as HTMLInputElement
    expect(input).not.toBeNull()
    expect(input.value).toBe('')

    // Several shortcuts from keyboardShortcuts.ts should be visible
    const text = document.body.textContent ?? ''
    expect(text).toContain('打開此快捷鍵面板')
    expect(text).toContain('Konami Code')

    wrapper.unmount()
  })

  // -------------------------------------------------------------------------
  // 2. Typing 'konami' → Konami Code shortcut visible
  // -------------------------------------------------------------------------
  it('filters to show Konami Code when typing "konami"', async () => {
    const wrapper = mount(KeyboardShortcutsHelp, MOUNT_OPTS)
    isOpen.value = true
    await flushPromises()

    const input = document.querySelector('.ksh-search') as HTMLInputElement
    input.value = 'konami'
    input.dispatchEvent(new Event('input'))
    await flushPromises()

    const text = document.body.textContent ?? ''
    expect(text).toContain('Konami Code')
    // Navigation shortcuts should be filtered out
    expect(text).not.toContain('切換到 監控 tab')

    wrapper.unmount()
  })

  // -------------------------------------------------------------------------
  // 3. Typing nonsense → empty state visible, 0 shortcut rows
  // -------------------------------------------------------------------------
  it('shows empty state and no rows when query has no matches', async () => {
    const wrapper = mount(KeyboardShortcutsHelp, MOUNT_OPTS)
    isOpen.value = true
    await flushPromises()

    const input = document.querySelector('.ksh-search') as HTMLInputElement
    input.value = 'xyzxyzxyz999'
    input.dispatchEvent(new Event('input'))
    await flushPromises()

    const text = document.body.textContent ?? ''
    expect(text).toContain('找不到符合的快捷鍵')
    // No table rows for shortcuts
    const rows = document.querySelectorAll('.ksh-row')
    expect(rows.length).toBe(0)

    wrapper.unmount()
  })

  // -------------------------------------------------------------------------
  // 4. Case-insensitive search
  // -------------------------------------------------------------------------
  it('matches case-insensitively', async () => {
    const wrapper = mount(KeyboardShortcutsHelp, MOUNT_OPTS)
    isOpen.value = true
    await flushPromises()

    const input = document.querySelector('.ksh-search') as HTMLInputElement
    // "AMBIENT" should match "Ambient mode 開/關"
    input.value = 'AMBIENT'
    input.dispatchEvent(new Event('input'))
    await flushPromises()

    const text = document.body.textContent ?? ''
    expect(text).toContain('Ambient mode')

    wrapper.unmount()
  })

  // -------------------------------------------------------------------------
  // 5. Esc with non-empty query clears query, does NOT close modal
  // -------------------------------------------------------------------------
  it('pressing Esc with non-empty query clears query without closing modal', async () => {
    const wrapper = mount(KeyboardShortcutsHelp, MOUNT_OPTS)
    isOpen.value = true
    await flushPromises()

    const input = document.querySelector('.ksh-search') as HTMLInputElement
    input.value = 'Pomodoro'
    input.dispatchEvent(new Event('input'))
    await flushPromises()

    expect(isOpen.value).toBe(true)

    // Fire Esc on the dialog
    const dialog = document.querySelector('.ksh-dialog') as HTMLElement
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushPromises()

    // Modal still open
    expect(isOpen.value).toBe(true)
    // Query cleared (v-model syncs to input.value after Vue re-render)
    const freshInput = document.querySelector('.ksh-search') as HTMLInputElement
    expect(freshInput.value).toBe('')

    wrapper.unmount()
  })

  // -------------------------------------------------------------------------
  // 6. Esc with empty query closes modal
  // -------------------------------------------------------------------------
  it('pressing Esc with empty query closes modal', async () => {
    const wrapper = mount(KeyboardShortcutsHelp, MOUNT_OPTS)
    isOpen.value = true
    await flushPromises()

    expect(isOpen.value).toBe(true)

    // Ensure query is empty
    const input = document.querySelector('.ksh-search') as HTMLInputElement
    expect(input.value).toBe('')

    const dialog = document.querySelector('.ksh-dialog') as HTMLElement
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushPromises()

    expect(isOpen.value).toBe(false)

    wrapper.unmount()
  })

  // -------------------------------------------------------------------------
  // 7. Search by keys field — arrow character finds Konami Code
  // -------------------------------------------------------------------------
  it('filters by keys field — searching arrow up finds Konami Code', async () => {
    const wrapper = mount(KeyboardShortcutsHelp, MOUNT_OPTS)
    isOpen.value = true
    await flushPromises()

    const input = document.querySelector('.ksh-search') as HTMLInputElement
    input.value = '↑'
    input.dispatchEvent(new Event('input'))
    await flushPromises()

    const text = document.body.textContent ?? ''
    expect(text).toContain('Konami Code')

    wrapper.unmount()
  })
})
