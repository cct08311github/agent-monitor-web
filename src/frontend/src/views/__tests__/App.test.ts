import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent } from 'vue'

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
