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
    latestDashboard: null as { agents: Array<{ status: string }> } | null,
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

vi.mock('@/components/HeartbeatPulse.vue', () => ({
  default: defineComponent({ template: '<span class="heartbeat-pulse-stub" />' }),
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
// Mock useVoiceCommand
// ---------------------------------------------------------------------------

const { mockVoiceSupported, mockVoiceListening, mockVoiceToggle } = vi.hoisted(() => {
  const mockVoiceSupported = { value: true }
  const mockVoiceListening = { value: false }
  const mockVoiceToggle = vi.fn()
  return { mockVoiceSupported, mockVoiceListening, mockVoiceToggle }
})

vi.mock('@/composables/useVoiceCommand', () => ({
  useVoiceCommand: (_cb?: unknown) => ({
    supported: mockVoiceSupported,
    listening: mockVoiceListening,
    start: vi.fn(),
    stop: vi.fn(),
    toggle: mockVoiceToggle,
  }),
}))

// Mock parseVoice — don't call the real parser in App tests
vi.mock('@/utils/voiceParser', () => ({
  parseVoice: vi.fn(() => ({ type: 'unknown', raw: '' })),
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
    mockAppState.latestDashboard = null
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
    mockAppState.latestDashboard = null
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
    mockAppState.latestDashboard = null
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
    mockAppState.latestDashboard = null
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
// Ambient Mode
// ---------------------------------------------------------------------------

const { mockAmbientEnabled, mockAmbientToggle } = vi.hoisted(() => {
  const mockAmbientEnabled = { value: false }
  const mockAmbientToggle = vi.fn(() => {
    mockAmbientEnabled.value = !mockAmbientEnabled.value
  })
  return { mockAmbientEnabled, mockAmbientToggle }
})

vi.mock('@/composables/useAmbientMode', () => ({
  useAmbientMode: (_opts?: unknown) => ({
    enabled: mockAmbientEnabled,
    intervalMs: { value: 8000 },
    currentIndex: { value: 0 },
    isPaused: { value: false },
    toggle: mockAmbientToggle,
    setIntervalMs: vi.fn(),
    bumpInteraction: vi.fn(),
  }),
}))

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
    mockAppState.latestDashboard = null
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

// ---------------------------------------------------------------------------
// Ambient Mode Button
// ---------------------------------------------------------------------------

describe('App.vue — Ambient Mode Button', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRouteName.value = 'dashboard'
    mockAppState.currentDesktopTab = 'monitor'
    mockAppState.currentDetailAgentId = ''
    mockAppState.commandPaletteRequest = 0
    mockAppState.latestDashboard = null
    mockCompact.value = false
    capturedShortcuts.length = 0
    mockAmbientEnabled.value = false
  })

  // ── 1. Renders ambient button ──────────────────────────────────────────────

  it('renders ambient-btn button in header when not on login page', async () => {
    const wrapper = mount(App)
    await flushPromises()

    expect(wrapper.find('.ambient-btn').exists()).toBe(true)
    wrapper.unmount()
  })

  // ── 2. Title shows OFF when disabled ──────────────────────────────────────

  it('ambient button title shows OFF when ambient is disabled', async () => {
    mockAmbientEnabled.value = false
    const wrapper = mount(App)
    await flushPromises()

    const btn = wrapper.find('.ambient-btn')
    expect(btn.attributes('title')).toContain('OFF')
    wrapper.unmount()
  })

  // ── 3. Title shows ON when enabled ────────────────────────────────────────

  it('ambient button title shows ON when ambient is enabled', async () => {
    mockAmbientEnabled.value = true
    const wrapper = mount(App)
    await flushPromises()

    const btn = wrapper.find('.ambient-btn')
    expect(btn.attributes('title')).toContain('ON')
    wrapper.unmount()
  })

  // ── 4. Click calls toggle ─────────────────────────────────────────────────

  it('clicking ambient-btn calls ambient.toggle()', async () => {
    const wrapper = mount(App)
    await flushPromises()

    await wrapper.find('.ambient-btn').trigger('click')
    expect(mockAmbientToggle).toHaveBeenCalledOnce()
    wrapper.unmount()
  })

  // ── 5. aria-pressed reflects enabled state ────────────────────────────────

  it('ambient button has aria-pressed=false when disabled', async () => {
    mockAmbientEnabled.value = false
    const wrapper = mount(App)
    await flushPromises()

    const btn = wrapper.find('.ambient-btn')
    expect(btn.attributes('aria-pressed')).toBe('false')
    wrapper.unmount()
  })

  it('ambient button has aria-pressed=true when enabled', async () => {
    mockAmbientEnabled.value = true
    const wrapper = mount(App)
    await flushPromises()

    const btn = wrapper.find('.ambient-btn')
    expect(btn.attributes('aria-pressed')).toBe('true')
    wrapper.unmount()
  })

  // ── 6. Shift+M shortcut is registered ─────────────────────────────────────

  it('registers Shift+M shortcut for Ambient mode toggle', async () => {
    const wrapper = mount(App)
    await flushPromises()

    const ambientShortcut = capturedShortcuts.find(
      (s) => s.key === 'm' && s.shift === true,
    )
    expect(ambientShortcut).toBeDefined()
    expect(ambientShortcut?.category).toBe('Actions')
    wrapper.unmount()
  })

  // ── 7. Hidden on login page ────────────────────────────────────────────────

  it('does not render ambient-btn on login page', async () => {
    mockRouteName.value = 'login'
    const wrapper = mount(App)
    await flushPromises()

    expect(wrapper.find('.ambient-btn').exists()).toBe(false)
    wrapper.unmount()
  })
})

// ---------------------------------------------------------------------------
// Voice Command Button
// ---------------------------------------------------------------------------

describe('App.vue — Voice Command Button', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRouteName.value = 'dashboard'
    mockAppState.currentDesktopTab = 'monitor'
    mockAppState.currentDetailAgentId = ''
    mockAppState.commandPaletteRequest = 0
    mockAppState.latestDashboard = null
    mockCompact.value = false
    capturedShortcuts.length = 0
    mockVoiceSupported.value = true
    mockVoiceListening.value = false
  })

  // ── 1. Renders voice button when not on login page ─────────────────────────

  it('renders voice-btn when not on login page', async () => {
    const wrapper = mount(App)
    await flushPromises()

    expect(wrapper.find('.voice-btn').exists()).toBe(true)
    wrapper.unmount()
  })

  // ── 2. Does NOT render on login page ──────────────────────────────────────

  it('does not render voice-btn on login page', async () => {
    mockRouteName.value = 'login'
    const wrapper = mount(App)
    await flushPromises()

    expect(wrapper.find('.voice-btn').exists()).toBe(false)
    wrapper.unmount()
  })

  // ── 3. Has correct aria-label ─────────────────────────────────────────────

  it('voice button has aria-label="voice command"', async () => {
    const wrapper = mount(App)
    await flushPromises()

    expect(wrapper.find('.voice-btn').attributes('aria-label')).toBe('voice command')
    wrapper.unmount()
  })

  // ── 4. Disabled when not supported ───────────────────────────────────────

  it('voice button is disabled when supported is false', async () => {
    mockVoiceSupported.value = false
    const wrapper = mount(App)
    await flushPromises()

    const btn = wrapper.find('.voice-btn')
    expect(btn.attributes('disabled')).toBeDefined()
    expect(btn.classes()).toContain('voice-btn--unsupported')
    wrapper.unmount()
  })

  // ── 5. Not disabled when supported ───────────────────────────────────────

  it('voice button is NOT disabled when supported is true', async () => {
    mockVoiceSupported.value = true
    const wrapper = mount(App)
    await flushPromises()

    const btn = wrapper.find('.voice-btn')
    expect(btn.attributes('disabled')).toBeUndefined()
    wrapper.unmount()
  })

  // ── 6. Has listening class when listening ─────────────────────────────────

  it('voice button has voice-btn--listening class when listening', async () => {
    mockVoiceListening.value = true
    const wrapper = mount(App)
    await flushPromises()

    expect(wrapper.find('.voice-btn').classes()).toContain('voice-btn--listening')
    wrapper.unmount()
  })

  // ── 7. Does not have listening class when not listening ───────────────────

  it('voice button does not have voice-btn--listening class when idle', async () => {
    mockVoiceListening.value = false
    const wrapper = mount(App)
    await flushPromises()

    expect(wrapper.find('.voice-btn').classes()).not.toContain('voice-btn--listening')
    wrapper.unmount()
  })

  // ── 8. Click calls toggle ─────────────────────────────────────────────────

  it('clicking voice-btn calls voice.toggle()', async () => {
    mockVoiceSupported.value = true
    const wrapper = mount(App)
    await flushPromises()

    await wrapper.find('.voice-btn').trigger('click')
    expect(mockVoiceToggle).toHaveBeenCalledOnce()
    wrapper.unmount()
  })

  // ── 9. Title shows unsupported message when not supported ─────────────────

  it('title indicates unsupported when SpeechRecognition is unavailable', async () => {
    mockVoiceSupported.value = false
    const wrapper = mount(App)
    await flushPromises()

    const title = wrapper.find('.voice-btn').attributes('title') ?? ''
    expect(title).toContain('瀏覽器不支援')
    wrapper.unmount()
  })

  // ── 10. Title shows listening message when active ─────────────────────────

  it('title shows listening message when voice is active', async () => {
    mockVoiceListening.value = true
    const wrapper = mount(App)
    await flushPromises()

    const title = wrapper.find('.voice-btn').attributes('title') ?? ''
    expect(title).toContain('錄音中')
    wrapper.unmount()
  })
})
