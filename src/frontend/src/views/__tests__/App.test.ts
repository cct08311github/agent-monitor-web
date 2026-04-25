import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'

// ---------------------------------------------------------------------------
// Hoisted mocks — shared refs between vi.mock factories
// ---------------------------------------------------------------------------

const { mockRouteName, mockAppState } = vi.hoisted(() => {
  const mockRouteName = { value: 'dashboard' as string | null }
  const mockAppState = {
    currentDesktopTab: 'monitor' as string,
    currentDetailAgentId: '',
    commandPaletteRequest: 0,
  }
  return { mockRouteName, mockAppState }
})

// ---------------------------------------------------------------------------
// Mock vue-router
// ---------------------------------------------------------------------------

vi.mock('vue-router', () => ({
  useRoute: () => ({
    name: mockRouteName.value,
  }),
  useRouter: () => ({
    push: vi.fn(),
  }),
  RouterView: defineComponent({ template: '<div class="router-view-stub" />' }),
}))

// ---------------------------------------------------------------------------
// Mock composables
// ---------------------------------------------------------------------------

const { mockSetTheme } = vi.hoisted(() => {
  const mockSetTheme = vi.fn()
  return { mockSetTheme }
})

vi.mock('@/composables/useTheme', () => ({
  useTheme: () => ({
    cycleTheme: vi.fn(),
    currentTheme: { value: 'auto' },
    effectiveTheme: { value: 'dark' },
    setTheme: mockSetTheme,
  }),
}))

vi.mock('@/composables/useAuth', () => ({
  useAuth: () => ({
    username: { value: 'test-user' },
    logout: vi.fn().mockResolvedValue(undefined),
  }),
}))

// ---------------------------------------------------------------------------
// Mock appState
// ---------------------------------------------------------------------------

vi.mock('@/stores/appState', () => ({
  appState: mockAppState,
}))

// ---------------------------------------------------------------------------
// Mock child components that would cause side effects
// ---------------------------------------------------------------------------

vi.mock('@/components/ToastContainer.vue', () => ({
  default: defineComponent({ template: '<div class="toast-stub" />' }),
}))

vi.mock('@/components/ConfirmDialog.vue', () => ({
  default: defineComponent({ template: '<div class="confirm-stub" />' }),
}))

vi.mock('@/components/AlertBadge.vue', () => ({
  default: defineComponent({ template: '<div class="alert-badge-stub" />' }),
}))

// ---------------------------------------------------------------------------
// Mock useKeyboardShortcuts — capture registered shortcuts
// ---------------------------------------------------------------------------

const { capturedShortcuts } = vi.hoisted(() => {
  const capturedShortcuts: Array<{ key: string; shift?: boolean; handler: () => void; description: string; category?: string }> = []
  return { capturedShortcuts }
})

vi.mock('@/composables/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: () => ({
    registerShortcut: (s: { key: string; shift?: boolean; handler: () => void; description: string; category?: string }) => {
      capturedShortcuts.push(s)
    },
    unregisterShortcut: vi.fn(),
    getShortcuts: () => [...capturedShortcuts],
  }),
}))

// ---------------------------------------------------------------------------
// Mock useCompactMode — use a reactive ref inside the mock factory
// ---------------------------------------------------------------------------

const mockCompact = ref(false)
const mockToggleCompact = vi.fn(() => {
  mockCompact.value = !mockCompact.value
})

vi.mock('@/composables/useCompactMode', () => ({
  useCompactMode: () => ({
    compact: mockCompact,
    toggleCompact: mockToggleCompact,
    setCompact: vi.fn(),
  }),
}))

// ---------------------------------------------------------------------------
// Mock useKonamiCode — capture the callback for manual triggering in tests
// ---------------------------------------------------------------------------

const { capturedKonamiCallback } = vi.hoisted(() => {
  const capturedKonamiCallback = { fn: null as (() => void) | null }
  return { capturedKonamiCallback }
})

vi.mock('@/composables/useKonamiCode', () => ({
  useKonamiCode: (cb: () => void) => {
    capturedKonamiCallback.fn = cb
  },
}))

// ---------------------------------------------------------------------------
// Mock showToast
// ---------------------------------------------------------------------------

const { mockShowToast } = vi.hoisted(() => {
  const mockShowToast = vi.fn()
  return { mockShowToast }
})

vi.mock('@/composables/useToast', () => ({
  showToast: mockShowToast,
  useToast: () => ({
    toasts: { value: [] },
    showToast: mockShowToast,
    dismissToast: vi.fn(),
    dismissAll: vi.fn(),
    ICONS: {},
  }),
}))

// ---------------------------------------------------------------------------
// Import App AFTER all mocks are in place
// ---------------------------------------------------------------------------

import App from '../../App.vue'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('App.vue — Command Palette opener button', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRouteName.value = 'dashboard'
    mockAppState.commandPaletteRequest = 0
    mockAppState.currentDesktopTab = 'monitor'
    mockAppState.currentDetailAgentId = ''
    mockCompact.value = false
    capturedShortcuts.length = 0
  })

  // ── Render ─────────────────────────────────────────────────────────────────

  it('renders palette opener button when not on login page', async () => {
    const wrapper = mount(App)
    await flushPromises()

    expect(wrapper.find('.palette-opener-btn').exists()).toBe(true)
    wrapper.unmount()
  })

  it('does not render palette opener button on login page', async () => {
    mockRouteName.value = 'login'
    const wrapper = mount(App)
    await flushPromises()

    expect(wrapper.find('.palette-opener-btn').exists()).toBe(false)
    wrapper.unmount()
  })

  // ── Click increments commandPaletteRequest ──────────────────────────────────

  it('clicking button increments appState.commandPaletteRequest', async () => {
    const wrapper = mount(App)
    await flushPromises()

    expect(mockAppState.commandPaletteRequest).toBe(0)
    await wrapper.find('.palette-opener-btn').trigger('click')
    expect(mockAppState.commandPaletteRequest).toBe(1)
    wrapper.unmount()
  })

  it('multiple clicks keep incrementing commandPaletteRequest', async () => {
    const wrapper = mount(App)
    await flushPromises()

    await wrapper.find('.palette-opener-btn').trigger('click')
    await wrapper.find('.palette-opener-btn').trigger('click')
    await wrapper.find('.palette-opener-btn').trigger('click')
    expect(mockAppState.commandPaletteRequest).toBe(3)
    wrapper.unmount()
  })

  // ── Accessibility ─────────────────────────────────────────────────────────

  it('palette button has aria-label', async () => {
    const wrapper = mount(App)
    await flushPromises()

    const btn = wrapper.find('.palette-opener-btn')
    expect(btn.attributes('aria-label')).toBe('開啟 Command Palette')
    wrapper.unmount()
  })

  it('palette button has a title attribute including keyboard hint', async () => {
    const wrapper = mount(App)
    await flushPromises()

    const btn = wrapper.find('.palette-opener-btn')
    const title = btn.attributes('title') ?? ''
    expect(title).toMatch(/K/i) // contains K (⌘K or Ctrl+K)
    wrapper.unmount()
  })

  // ── Cmd K hint text ────────────────────────────────────────────────────────

  it('shows Mac hint (⌘K) when navigator.platform includes Mac', async () => {
    const originalPlatform = Object.getOwnPropertyDescriptor(navigator, 'platform')
    Object.defineProperty(navigator, 'platform', {
      value: 'MacIntel',
      configurable: true,
    })

    const wrapper = mount(App)
    await flushPromises()

    const btn = wrapper.find('.palette-opener-btn')
    const title = btn.attributes('title') ?? ''
    expect(title).toContain('⌘K')

    // Restore
    if (originalPlatform) {
      Object.defineProperty(navigator, 'platform', originalPlatform)
    }
    wrapper.unmount()
  })

  it('shows non-Mac hint (Ctrl+K) when navigator.platform is not Mac', async () => {
    const originalPlatform = Object.getOwnPropertyDescriptor(navigator, 'platform')
    Object.defineProperty(navigator, 'platform', {
      value: 'Win32',
      configurable: true,
    })

    const wrapper = mount(App)
    await flushPromises()

    const btn = wrapper.find('.palette-opener-btn')
    const title = btn.attributes('title') ?? ''
    expect(title).toContain('Ctrl+K')

    // Restore
    if (originalPlatform) {
      Object.defineProperty(navigator, 'platform', originalPlatform)
    }
    wrapper.unmount()
  })

  // ── Login page hides full header ───────────────────────────────────────────

  it('hides the entire header on login page', async () => {
    mockRouteName.value = 'login'
    const wrapper = mount(App)
    await flushPromises()

    expect(wrapper.find('.app-header').exists()).toBe(false)
    wrapper.unmount()
  })
})

// ---------------------------------------------------------------------------
// Theme select dropdown — 5-option palette
// ---------------------------------------------------------------------------

describe('App.vue — Theme select dropdown', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRouteName.value = 'dashboard'
    mockAppState.currentDesktopTab = 'monitor'
  })

  it('renders a theme select dropdown with 5 options', async () => {
    const wrapper = mount(App)
    await flushPromises()

    const select = wrapper.find('.header-theme-select')
    expect(select.exists()).toBe(true)

    const options = wrapper.findAll('.header-theme-select option')
    expect(options).toHaveLength(5)
    wrapper.unmount()
  })

  it('theme select options include light, dark, auto, neon, retro', async () => {
    const wrapper = mount(App)
    await flushPromises()

    const options = wrapper.findAll('.header-theme-select option')
    const values = options.map((o) => o.attributes('value'))
    expect(values).toContain('light')
    expect(values).toContain('dark')
    expect(values).toContain('auto')
    expect(values).toContain('neon')
    expect(values).toContain('retro')
    wrapper.unmount()
  })

  it('theme select has accessible aria-label', async () => {
    const wrapper = mount(App)
    await flushPromises()

    const select = wrapper.find('.header-theme-select')
    expect(select.attributes('aria-label')).toBe('主題')
    wrapper.unmount()
  })

  it('theme select has a title attribute showing current theme', async () => {
    const wrapper = mount(App)
    await flushPromises()

    const select = wrapper.find('.header-theme-select')
    const title = select.attributes('title') ?? ''
    expect(title).toMatch(/auto/)
    wrapper.unmount()
  })

  it('theme select does not render on login page', async () => {
    mockRouteName.value = 'login'
    const wrapper = mount(App)
    await flushPromises()

    expect(wrapper.find('.header-theme-select').exists()).toBe(false)
    wrapper.unmount()
  })
})

// ---------------------------------------------------------------------------
// Konami Code Easter Egg
// ---------------------------------------------------------------------------

describe('App.vue — Konami Code Easter Egg', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRouteName.value = 'dashboard'
    mockAppState.currentDesktopTab = 'monitor'
    mockAppState.currentDetailAgentId = ''
    capturedKonamiCallback.fn = null
  })

  it('celebrating is false before Konami is triggered', async () => {
    const wrapper = mount(App)
    await flushPromises()

    expect(wrapper.find('.konami-celebrate').exists()).toBe(false)
    wrapper.unmount()
  })

  it('triggering Konami callback calls showToast with success', async () => {
    const wrapper = mount(App)
    await flushPromises()

    expect(capturedKonamiCallback.fn).not.toBeNull()
    capturedKonamiCallback.fn!()
    await flushPromises()

    expect(mockShowToast).toHaveBeenCalledWith(
      expect.stringContaining('Konami'),
      'success',
    )
    wrapper.unmount()
  })

  it('triggering Konami callback shows .konami-celebrate overlay', async () => {
    const wrapper = mount(App)
    await flushPromises()

    capturedKonamiCallback.fn!()
    await flushPromises()

    expect(wrapper.find('.konami-celebrate').exists()).toBe(true)
    wrapper.unmount()
  })

  it('.konami-celebrate renders 12 emoji spans', async () => {
    const wrapper = mount(App)
    await flushPromises()

    capturedKonamiCallback.fn!()
    await flushPromises()

    const emojis = wrapper.findAll('.konami-emoji')
    expect(emojis).toHaveLength(12)
    wrapper.unmount()
  })

  it('.konami-celebrate has aria-hidden="true"', async () => {
    const wrapper = mount(App)
    await flushPromises()

    capturedKonamiCallback.fn!()
    await flushPromises()

    const overlay = wrapper.find('.konami-celebrate')
    expect(overlay.attributes('aria-hidden')).toBe('true')
    wrapper.unmount()
  })
})

// ---------------------------------------------------------------------------
// Compact Mode Button
// ---------------------------------------------------------------------------

describe('App.vue — Compact Mode Toggle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRouteName.value = 'dashboard'
    mockAppState.currentDesktopTab = 'monitor'
    mockAppState.currentDetailAgentId = ''
    mockAppState.commandPaletteRequest = 0
    mockCompact.value = false
    capturedShortcuts.length = 0
  })

  it('renders compact mode button in header', async () => {
    const wrapper = mount(App)
    await flushPromises()

    // Find button with the compact mode title pattern
    const buttons = wrapper.findAll('.header-btn.icon-only')
    const compactBtn = buttons.find((b) => b.attributes('title')?.includes('Compact'))
    expect(compactBtn).toBeTruthy()
    wrapper.unmount()
  })

  it('compact button title shows OFF when compact is false', async () => {
    mockCompact.value = false
    const wrapper = mount(App)
    await flushPromises()

    const buttons = wrapper.findAll('.header-btn.icon-only')
    const compactBtn = buttons.find((b) => b.attributes('title')?.includes('Compact'))
    expect(compactBtn?.attributes('title')).toContain('OFF')
    wrapper.unmount()
  })

  it('compact button title shows ON when compact is true', async () => {
    mockCompact.value = true
    const wrapper = mount(App)
    await flushPromises()

    const buttons = wrapper.findAll('.header-btn.icon-only')
    const compactBtn = buttons.find((b) => b.attributes('title')?.includes('Compact'))
    expect(compactBtn?.attributes('title')).toContain('ON')
    wrapper.unmount()
  })

  it('clicking compact button calls toggleCompact', async () => {
    const wrapper = mount(App)
    await flushPromises()

    const buttons = wrapper.findAll('.header-btn.icon-only')
    const compactBtn = buttons.find((b) => b.attributes('title')?.includes('Compact'))
    await compactBtn!.trigger('click')

    expect(mockToggleCompact).toHaveBeenCalledOnce()
    wrapper.unmount()
  })

  it('root div does not have compact-mode class when compact is false', async () => {
    mockCompact.value = false
    const wrapper = mount(App)
    await flushPromises()

    expect(wrapper.find('#vue-app').classes()).not.toContain('compact-mode')
    wrapper.unmount()
  })

  it('root div has compact-mode class when compact is true', async () => {
    mockCompact.value = true
    const wrapper = mount(App)
    await flushPromises()

    expect(wrapper.find('#vue-app').classes()).toContain('compact-mode')
    wrapper.unmount()
  })

  it('compact button has aria-pressed attribute reflecting compact state', async () => {
    mockCompact.value = true
    const wrapper = mount(App)
    await flushPromises()

    const buttons = wrapper.findAll('.header-btn.icon-only')
    const compactBtn = buttons.find((b) => b.attributes('title')?.includes('Compact'))
    expect(compactBtn?.attributes('aria-pressed')).toBe('true')
    wrapper.unmount()
  })
})

// ---------------------------------------------------------------------------
// Pomodoro Timer
// ---------------------------------------------------------------------------

const {
  mockPomoPhase,
  mockPomoRunning,
  mockPomoRemainingDisplay,
  mockPomoToggle,
  mockPomoReset,
} = vi.hoisted(() => {
  const mockPomoPhase = { value: 'idle' as 'idle' | 'focus' | 'break' }
  const mockPomoRunning = { value: false }
  const mockPomoRemainingDisplay = { value: '25:00' }
  const mockPomoToggle = vi.fn()
  const mockPomoReset = vi.fn()
  return {
    mockPomoPhase,
    mockPomoRunning,
    mockPomoRemainingDisplay,
    mockPomoToggle,
    mockPomoReset,
  }
})

vi.mock('@/composables/usePomodoro', () => ({
  usePomodoro: (_cb?: unknown) => ({
    phase: mockPomoPhase,
    running: mockPomoRunning,
    remainingDisplay: mockPomoRemainingDisplay,
    toggle: mockPomoToggle,
    reset: mockPomoReset,
    start: vi.fn(),
    pause: vi.fn(),
    elapsed: { value: 0 },
    remaining: { value: 1500 },
    targetSecs: { value: 1500 },
  }),
}))

describe('App.vue — Pomodoro Timer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRouteName.value = 'dashboard'
    mockAppState.currentDesktopTab = 'monitor'
    mockAppState.currentDetailAgentId = ''
    mockAppState.commandPaletteRequest = 0
    mockCompact.value = false
    capturedShortcuts.length = 0
    mockPomoPhase.value = 'idle'
    mockPomoRunning.value = false
    mockPomoRemainingDisplay.value = '25:00'
  })

  // ── 1. Renders pomo button ─────────────────────────────────────────────────

  it('renders pomo-btn button in header when not on login page', async () => {
    const wrapper = mount(App)
    await flushPromises()

    expect(wrapper.find('.pomo-btn').exists()).toBe(true)
    wrapper.unmount()
  })

  // ── 2. Shows 25:00 when idle ───────────────────────────────────────────────

  it('displays 25:00 when phase is idle', async () => {
    mockPomoPhase.value = 'idle'
    const wrapper = mount(App)
    await flushPromises()

    expect(wrapper.find('.pomo-btn').text()).toContain('25:00')
    wrapper.unmount()
  })

  // ── 3. Shows remainingDisplay when not idle ────────────────────────────────

  it('displays remainingDisplay when phase is focus', async () => {
    mockPomoPhase.value = 'focus'
    mockPomoRemainingDisplay.value = '24:35'
    const wrapper = mount(App)
    await flushPromises()

    expect(wrapper.find('.pomo-btn').text()).toContain('24:35')
    wrapper.unmount()
  })

  // ── 4. Click calls toggle ──────────────────────────────────────────────────

  it('clicking pomo-btn calls pomo.toggle()', async () => {
    const wrapper = mount(App)
    await flushPromises()

    await wrapper.find('.pomo-btn').trigger('click')
    expect(mockPomoToggle).toHaveBeenCalledOnce()
    wrapper.unmount()
  })

  // ── 5. Right-click calls reset ─────────────────────────────────────────────

  it('right-clicking pomo-btn calls pomo.reset()', async () => {
    const wrapper = mount(App)
    await flushPromises()

    await wrapper.find('.pomo-btn').trigger('contextmenu')
    expect(mockPomoReset).toHaveBeenCalledOnce()
    wrapper.unmount()
  })

  // ── 6. Accessibility: aria-label ──────────────────────────────────────────

  it('pomo-btn has aria-label="Pomodoro timer"', async () => {
    const wrapper = mount(App)
    await flushPromises()

    expect(wrapper.find('.pomo-btn').attributes('aria-label')).toBe('Pomodoro timer')
    wrapper.unmount()
  })

  // ── 7. Shift+P shortcut is registered ─────────────────────────────────────

  it('registers Shift+P shortcut for Pomodoro toggle', async () => {
    const wrapper = mount(App)
    await flushPromises()

    const pomoShortcut = capturedShortcuts.find(
      (s) => s.key === 'p' && s.shift === true,
    )
    expect(pomoShortcut).toBeDefined()
    expect(pomoShortcut?.category).toBe('Actions')
    wrapper.unmount()
  })

  // ── 8. Hidden on login page ────────────────────────────────────────────────

  it('does not render pomo-btn on login page', async () => {
    mockRouteName.value = 'login'
    const wrapper = mount(App)
    await flushPromises()

    expect(wrapper.find('.pomo-btn').exists()).toBe(false)
    wrapper.unmount()
  })
})
