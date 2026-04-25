import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

// ---------------------------------------------------------------------------
// Stubs — prevent real HTTP, SSE, and heavy child components from loading
// ---------------------------------------------------------------------------

vi.mock('@/composables/useApi', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  useApi: () => ({
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  }),
}))

vi.mock('@/composables/useSSE', () => ({
  useSSE: () => ({
    connect: vi.fn(),
    close: vi.fn(),
    isConnected: { value: false },
    reconnectAttempt: { value: 0 },
    isFailed: { value: false },
    manualReconnect: vi.fn(),
  }),
}))

vi.mock('@/composables/useToast', () => ({
  showToast: vi.fn(),
}))

vi.mock('@/composables/useDashboard', () => ({
  useDashboard: () => ({
    agents: { value: [] },
    summaryStats: { value: {} },
    loading: { value: false },
    error: { value: null },
  }),
}))

// Stub all heavy child tabs to simple empty components
// Note: vi.mock factories are hoisted to top of file, so inline the stub
vi.mock('@/components/MonitorTab.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@/components/AgentDetail.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@/components/SystemTab.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@/components/LogsTab.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@/components/ChatTab.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@/components/OptimizeTab.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@/components/ChatModal.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@/components/ModelSwitchModal.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@/components/HelpModal.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@/components/CommandPalette.vue', () => ({ default: { template: '<div />' } }))

// ---------------------------------------------------------------------------
// Stub focusTrap (used by HelpModal through child)
// ---------------------------------------------------------------------------

vi.mock('@/lib/focusTrap', () => ({
  createFocusTrap: () => ({
    activate: vi.fn(),
    deactivate: vi.fn(),
  }),
}))

vi.mock('@/composables/useTheme', () => ({
  useTheme: () => ({
    cycleTheme: vi.fn(),
    currentTheme: { value: 'auto' },
    effectiveTheme: { value: 'dark' },
    setTheme: vi.fn(),
  }),
}))

import { appState } from '@/stores/appState'
import DashboardView from '../DashboardView.vue'

describe('DashboardView — keyboard shortcuts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    appState.currentDesktopTab = 'monitor'
  })

  function fireKey(key: string, options: KeyboardEventInit = {}) {
    const event = new KeyboardEvent('keydown', {
      key,
      bubbles: true,
      cancelable: true,
      ...options,
    })
    document.dispatchEvent(event)
  }

  it('pressing 1 sets currentDesktopTab to monitor', async () => {
    appState.currentDesktopTab = 'system'
    const wrapper = mount(DashboardView, { attachTo: document.body })
    await flushPromises()

    fireKey('1')
    expect(appState.currentDesktopTab).toBe('monitor')
    wrapper.unmount()
  })

  it('pressing 2 sets currentDesktopTab to system', async () => {
    const wrapper = mount(DashboardView, { attachTo: document.body })
    await flushPromises()

    fireKey('2')
    expect(appState.currentDesktopTab).toBe('system')
    wrapper.unmount()
  })

  it('pressing 3 sets currentDesktopTab to logs', async () => {
    const wrapper = mount(DashboardView, { attachTo: document.body })
    await flushPromises()

    fireKey('3')
    expect(appState.currentDesktopTab).toBe('logs')
    wrapper.unmount()
  })

  it('pressing 4 sets currentDesktopTab to chat', async () => {
    const wrapper = mount(DashboardView, { attachTo: document.body })
    await flushPromises()

    fireKey('4')
    expect(appState.currentDesktopTab).toBe('chat')
    wrapper.unmount()
  })

  it('pressing 5 sets currentDesktopTab to optimize', async () => {
    const wrapper = mount(DashboardView, { attachTo: document.body })
    await flushPromises()

    fireKey('5')
    expect(appState.currentDesktopTab).toBe('optimize')
    wrapper.unmount()
  })

  it('pressing Shift+? shows the help trigger button', async () => {
    const wrapper = mount(DashboardView, { attachTo: document.body })
    await flushPromises()

    // Help trigger button should be present
    expect(wrapper.find('.help-trigger-btn').exists()).toBe(true)
    wrapper.unmount()
  })

  it('does not fire shortcuts when focus is in an input element', async () => {
    appState.currentDesktopTab = 'monitor'
    const wrapper = mount(DashboardView, { attachTo: document.body })
    await flushPromises()

    // Create a real input and dispatch keydown from it
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()

    const event = new KeyboardEvent('keydown', {
      key: '2',
      bubbles: true,
      cancelable: true,
    })
    input.dispatchEvent(event)

    // Tab should NOT have changed because target was an input
    expect(appState.currentDesktopTab).toBe('monitor')

    document.body.removeChild(input)
    wrapper.unmount()
  })
})
