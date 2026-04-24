import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

// ---------------------------------------------------------------------------
// Hoisted setup — vi.hoisted runs before vi.mock, so we can share refs
// ---------------------------------------------------------------------------

const { mockGet, mockAppState } = vi.hoisted(() => {
  // Use plain objects / functions — no reactive here (runs before Vue init)
  const mockGet = vi.fn()
  const mockAppState = {
    currentDesktopTab: 'monitor' as string,
    preferredMonitorSubTab: null as string | null,
  }
  return { mockGet, mockAppState }
})

// ---------------------------------------------------------------------------
// Mock useApi
// ---------------------------------------------------------------------------

vi.mock('@/composables/useApi', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
  },
  useApi: () => ({
    get: (...args: unknown[]) => mockGet(...args),
  }),
}))

// ---------------------------------------------------------------------------
// Mock appState — plain object (Vue's reactive wrapping happens inside the
// module; the component imports appState which is reactive({...}) internally)
// ---------------------------------------------------------------------------

vi.mock('@/stores/appState', () => ({
  appState: mockAppState,
}))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = 1_700_000_000_000 // fixed epoch used for Date.now()

function makeAlert(severity: 'critical' | 'warning', tsOffset = 0) {
  return {
    rule: `rule_${severity}`,
    severity,
    message: `${severity} alert`,
    meta: {},
    ts: NOW + tsOffset,
  }
}

function emptyResponse() {
  return { success: true, data: { alerts: [] } }
}

function alertsResponse(alerts: ReturnType<typeof makeAlert>[]) {
  return { success: true, data: { alerts } }
}

// ---------------------------------------------------------------------------
// Import component AFTER mocks
// ---------------------------------------------------------------------------

import AlertBadge from '../AlertBadge.vue'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AlertBadge', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    vi.clearAllMocks()
    mockAppState.currentDesktopTab = 'monitor'
    mockAppState.preferredMonitorSubTab = null
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ── No alerts ─────────────────────────────────────────────────────────────

  describe('no alerts', () => {
    it('hides the badge when there are no alerts', async () => {
      mockGet.mockResolvedValue(emptyResponse())
      const wrapper = mount(AlertBadge)
      await flushPromises()

      expect(wrapper.find('.alert-badge').exists()).toBe(false)
      wrapper.unmount()
    })

    it('renders the bell icon regardless of alert count', async () => {
      mockGet.mockResolvedValue(emptyResponse())
      const wrapper = mount(AlertBadge)
      await flushPromises()

      expect(wrapper.find('.bell-icon').exists()).toBe(true)
      wrapper.unmount()
    })
  })

  // ── Warning alerts ─────────────────────────────────────────────────────────

  describe('warning alerts', () => {
    it('shows amber badge with warning count', async () => {
      mockGet.mockResolvedValue(alertsResponse([makeAlert('warning')]))
      const wrapper = mount(AlertBadge)
      await flushPromises()

      const badge = wrapper.find('.alert-badge')
      expect(badge.exists()).toBe(true)
      expect(badge.classes()).toContain('warning')
      expect(badge.text()).toBe('1')
      wrapper.unmount()
    })

    it('badge does not have critical class when only warnings', async () => {
      mockGet.mockResolvedValue(alertsResponse([makeAlert('warning'), makeAlert('warning')]))
      const wrapper = mount(AlertBadge)
      await flushPromises()

      const badge = wrapper.find('.alert-badge')
      expect(badge.classes()).not.toContain('critical')
      expect(badge.text()).toBe('2')
      wrapper.unmount()
    })
  })

  // ── Critical alerts ────────────────────────────────────────────────────────

  describe('critical alerts', () => {
    it('shows red badge with critical count', async () => {
      mockGet.mockResolvedValue(alertsResponse([makeAlert('critical')]))
      const wrapper = mount(AlertBadge)
      await flushPromises()

      const badge = wrapper.find('.alert-badge')
      expect(badge.exists()).toBe(true)
      expect(badge.classes()).toContain('critical')
      expect(badge.text()).toBe('1')
      wrapper.unmount()
    })
  })

  // ── Mixed: critical takes precedence ──────────────────────────────────────

  describe('mixed severity', () => {
    it('shows critical class and critical count when both exist', async () => {
      mockGet.mockResolvedValue(
        alertsResponse([makeAlert('critical'), makeAlert('warning'), makeAlert('warning')]),
      )
      const wrapper = mount(AlertBadge)
      await flushPromises()

      const badge = wrapper.find('.alert-badge')
      expect(badge.classes()).toContain('critical')
      expect(badge.classes()).not.toContain('warning')
      // badgeCount = criticalCount (1), not warningCount (2)
      expect(badge.text()).toBe('1')
      wrapper.unmount()
    })
  })

  // ── 5-minute window ────────────────────────────────────────────────────────

  describe('5-minute window', () => {
    it('excludes alerts older than 5 minutes', async () => {
      const oldAlert = makeAlert('critical', -(5 * 60 * 1000 + 1)) // 1ms too old
      mockGet.mockResolvedValue(alertsResponse([oldAlert]))
      const wrapper = mount(AlertBadge)
      await flushPromises()

      expect(wrapper.find('.alert-badge').exists()).toBe(false)
      wrapper.unmount()
    })

    it('includes alerts exactly at the 5-minute boundary', async () => {
      const boundaryAlert = makeAlert('warning', -(5 * 60 * 1000)) // exact boundary
      mockGet.mockResolvedValue(alertsResponse([boundaryAlert]))
      const wrapper = mount(AlertBadge)
      await flushPromises()

      expect(wrapper.find('.alert-badge').exists()).toBe(true)
      wrapper.unmount()
    })
  })

  // ── Click navigation ───────────────────────────────────────────────────────

  describe('click navigation', () => {
    it('sets currentDesktopTab to monitor on click', async () => {
      mockGet.mockResolvedValue(emptyResponse())
      const wrapper = mount(AlertBadge)
      await flushPromises()

      mockAppState.currentDesktopTab = 'logs'
      await wrapper.find('button').trigger('click')

      expect(mockAppState.currentDesktopTab).toBe('monitor')
      wrapper.unmount()
    })

    it('sets preferredMonitorSubTab to observability on click', async () => {
      mockGet.mockResolvedValue(emptyResponse())
      const wrapper = mount(AlertBadge)
      await flushPromises()

      await wrapper.find('button').trigger('click')

      expect(mockAppState.preferredMonitorSubTab).toBe('observability')
      wrapper.unmount()
    })
  })

  // ── Polling lifecycle ──────────────────────────────────────────────────────

  describe('polling lifecycle', () => {
    it('calls the API on mount', async () => {
      mockGet.mockResolvedValue(emptyResponse())
      const wrapper = mount(AlertBadge)
      await flushPromises()

      expect(mockGet).toHaveBeenCalledWith('/api/alerts/recent?limit=10')
      wrapper.unmount()
    })

    it('polls again after 30 seconds', async () => {
      mockGet.mockResolvedValue(emptyResponse())
      const wrapper = mount(AlertBadge)
      await flushPromises()

      mockGet.mockClear()
      vi.advanceTimersByTime(30_000)
      await flushPromises()

      expect(mockGet).toHaveBeenCalledTimes(1)
      wrapper.unmount()
    })

    it('polls a second time after 60 seconds total', async () => {
      mockGet.mockResolvedValue(emptyResponse())
      const wrapper = mount(AlertBadge)
      await flushPromises()

      mockGet.mockClear()
      vi.advanceTimersByTime(60_000)
      await flushPromises()

      expect(mockGet).toHaveBeenCalledTimes(2)
      wrapper.unmount()
    })

    it('clears the interval on unmount', async () => {
      mockGet.mockResolvedValue(emptyResponse())
      const wrapper = mount(AlertBadge)
      await flushPromises()

      wrapper.unmount()
      mockGet.mockClear()
      vi.advanceTimersByTime(30_000)
      await flushPromises()

      // No more calls after unmount
      expect(mockGet).not.toHaveBeenCalled()
    })
  })

  // ── Silent failure ─────────────────────────────────────────────────────────

  describe('silent failure', () => {
    it('does not throw or show error UI when API fails', async () => {
      mockGet.mockRejectedValue(new Error('Network error'))
      // Should not throw
      const wrapper = mount(AlertBadge)
      await flushPromises()

      // Badge should remain hidden (no alerts loaded)
      expect(wrapper.find('.alert-badge').exists()).toBe(false)
      wrapper.unmount()
    })
  })

  // ── Accessibility ──────────────────────────────────────────────────────────

  describe('accessibility', () => {
    it('has role=status on the button', async () => {
      mockGet.mockResolvedValue(emptyResponse())
      const wrapper = mount(AlertBadge)
      await flushPromises()

      expect(wrapper.find('button').attributes('role')).toBe('status')
      wrapper.unmount()
    })

    it('has aria-live=polite on the button', async () => {
      mockGet.mockResolvedValue(emptyResponse())
      const wrapper = mount(AlertBadge)
      await flushPromises()

      expect(wrapper.find('button').attributes('aria-live')).toBe('polite')
      wrapper.unmount()
    })

    it('aria-label reflects alert count and severity', async () => {
      mockGet.mockResolvedValue(alertsResponse([makeAlert('critical')]))
      const wrapper = mount(AlertBadge)
      await flushPromises()

      const btn = wrapper.find('button')
      expect(btn.attributes('aria-label')).toContain('1')
      expect(btn.attributes('aria-label')).toContain('critical')
      wrapper.unmount()
    })

    it('aria-label is "無 alert" when no alerts', async () => {
      mockGet.mockResolvedValue(emptyResponse())
      const wrapper = mount(AlertBadge)
      await flushPromises()

      expect(wrapper.find('button').attributes('aria-label')).toBe('無 alert')
      wrapper.unmount()
    })
  })
})
