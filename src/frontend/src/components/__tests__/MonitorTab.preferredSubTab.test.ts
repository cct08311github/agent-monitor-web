import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'

// ---------------------------------------------------------------------------
// Hoisted raw state — plain object used as a shared handle
// ---------------------------------------------------------------------------

const { rawState } = vi.hoisted(() => {
  const rawState = {
    currentDesktopTab: 'monitor' as string,
    preferredMonitorSubTab: null as string | null,
    agentSearchQuery: '',
    currentDetailAgentId: '',
  }
  return { rawState }
})

// ---------------------------------------------------------------------------
// Mock appState — the factory wraps rawState in reactive so Vue's watch fires
// ---------------------------------------------------------------------------

vi.mock('@/stores/appState', async () => {
  const { reactive } = await import('vue')
  const appState = reactive(rawState)
  return { appState }
})

// ---------------------------------------------------------------------------
// Expose reactive proxy as mockAppState for assertions in tests
// ---------------------------------------------------------------------------

import { appState as mockAppState } from '@/stores/appState'

// ---------------------------------------------------------------------------
// Mock useDashboard — return minimal data to avoid real SSE connections
// ---------------------------------------------------------------------------

vi.mock('@/composables/useDashboard', () => ({
  useDashboard: () => ({
    dashboard: { value: null },
    filteredAgents: { value: [] },
    activeAgents: { value: [] },
    inactiveAgents: { value: [] },
    subagents: { value: [] },
    connectionStatus: { value: 'connected' },
    costRange: { value: 'today' },
    getAgentCost: vi.fn().mockReturnValue(0),
    totalCost: { value: 0 },
    dataAge: { value: 0 },
    freshness: { value: 'fresh' },
  }),
}))

// ---------------------------------------------------------------------------
// Mock formatFreshnessLabel
// ---------------------------------------------------------------------------

vi.mock('@/lib/freshness', () => ({
  formatFreshnessLabel: () => 'fresh',
}))

// ---------------------------------------------------------------------------
// Stub child components
// ---------------------------------------------------------------------------

vi.mock('@/components/AgentMinimap.vue', () => ({
  default: { template: '<div class="stub-minimap" />' },
}))
vi.mock('@/components/AgentFocus.vue', () => ({
  default: { template: '<div class="stub-focus" />' },
}))
vi.mock('@/components/AgentPeriphery.vue', () => ({
  default: { template: '<div class="stub-periphery" />' },
}))
vi.mock('@/components/SubAgentGrid.vue', () => ({
  default: { template: '<div class="stub-subagent-grid" />' },
}))
vi.mock('@/components/SummaryCards.vue', () => ({
  default: { template: '<div class="stub-summary-cards" />' },
}))
vi.mock('@/components/CronTab.vue', () => ({
  default: { template: '<div class="stub-cron" />' },
}))
vi.mock('@/components/TaskHubTab.vue', () => ({
  default: { template: '<div class="stub-taskhub" />' },
}))
vi.mock('@/components/ObservabilityTab.vue', () => ({
  default: { template: '<div class="stub-observability" />' },
}))

// ---------------------------------------------------------------------------
// Import component AFTER mocks
// ---------------------------------------------------------------------------

import MonitorTab from '../MonitorTab.vue'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MonitorTab.preferredMonitorSubTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAppState.preferredMonitorSubTab = null
    mockAppState.currentDesktopTab = 'monitor'
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // ── onMounted: consume value set before mount ─────────────────────────────

  describe('onMounted: pre-set value', () => {
    it('switches to observability sub-tab when preferredMonitorSubTab is observability on mount', async () => {
      mockAppState.preferredMonitorSubTab = 'observability'
      const wrapper = mount(MonitorTab)
      await flushPromises()

      expect(wrapper.find('.stub-observability').exists()).toBe(true)
      wrapper.unmount()
    })

    it('clears preferredMonitorSubTab after consuming it on mount', async () => {
      mockAppState.preferredMonitorSubTab = 'observability'
      const wrapper = mount(MonitorTab)
      await flushPromises()

      expect(mockAppState.preferredMonitorSubTab).toBeNull()
      wrapper.unmount()
    })

    it('defaults to agents sub-tab when preferredMonitorSubTab is null on mount', async () => {
      mockAppState.preferredMonitorSubTab = null
      const wrapper = mount(MonitorTab)
      await flushPromises()

      expect(wrapper.find('.stub-focus').exists()).toBe(true)
      wrapper.unmount()
    })
  })

  // ── watch: consume value set after mount ──────────────────────────────────

  describe('watch: post-mount navigation', () => {
    it('switches to observability when preferredMonitorSubTab is set after mount', async () => {
      const wrapper = mount(MonitorTab)
      await flushPromises()

      // Initially on agents
      expect(wrapper.find('.stub-focus').exists()).toBe(true)

      // Simulate AlertBadge setting appState
      mockAppState.preferredMonitorSubTab = 'observability'
      await nextTick()
      await flushPromises()

      expect(wrapper.find('.stub-observability').exists()).toBe(true)
      wrapper.unmount()
    })

    it('clears preferredMonitorSubTab after watch consumes it', async () => {
      const wrapper = mount(MonitorTab)
      await flushPromises()

      mockAppState.preferredMonitorSubTab = 'observability'
      await nextTick()
      await flushPromises()

      expect(mockAppState.preferredMonitorSubTab).toBeNull()
      wrapper.unmount()
    })

    it('switches to cron when preferredMonitorSubTab is cron', async () => {
      const wrapper = mount(MonitorTab)
      await flushPromises()

      mockAppState.preferredMonitorSubTab = 'cron'
      await nextTick()
      await flushPromises()

      expect(wrapper.find('.stub-cron').exists()).toBe(true)
      wrapper.unmount()
    })

    it('ignores invalid sub-tab values', async () => {
      const wrapper = mount(MonitorTab)
      await flushPromises()

      mockAppState.preferredMonitorSubTab = 'nonexistent-tab'
      await nextTick()
      await flushPromises()

      // Should stay on agents (default)
      expect(wrapper.find('.stub-focus').exists()).toBe(true)
      // Should NOT clear the invalid value (no action taken)
      expect(mockAppState.preferredMonitorSubTab).toBe('nonexistent-tab')
      wrapper.unmount()
    })
  })

  // ── does not break existing manual tab switching ───────────────────────────

  describe('existing tab switching behaviour', () => {
    it('manually clicking a sub-tab still works', async () => {
      const wrapper = mount(MonitorTab)
      await flushPromises()

      const cronBtn = wrapper.findAll('.sub-tab').find((b) => b.text().includes('Cron'))
      await cronBtn?.trigger('click')

      expect(wrapper.find('.stub-cron').exists()).toBe(true)
      wrapper.unmount()
    })

    it('manually switching back to agents works after preferredMonitorSubTab navigation', async () => {
      const wrapper = mount(MonitorTab)
      await flushPromises()

      mockAppState.preferredMonitorSubTab = 'observability'
      await nextTick()
      await flushPromises()

      // Now manually go back to agents
      const agentsBtn = wrapper.findAll('.sub-tab').find((b) => b.text().includes('Agents'))
      await agentsBtn?.trigger('click')

      expect(wrapper.find('.stub-focus').exists()).toBe(true)
      wrapper.unmount()
    })
  })
})
