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

  // ── Popover — hover timing ─────────────────────────────────────────────────

  describe('popover hover behavior', () => {
    it('shows popover after 200ms mouseenter', async () => {
      mockGet.mockResolvedValue(alertsResponse([makeAlert('critical')]))
      const wrapper = mount(AlertBadge)
      await flushPromises()

      await wrapper.find('.alert-badge-wrapper').trigger('mouseenter')
      expect(wrapper.find('.popover').exists()).toBe(false)

      vi.advanceTimersByTime(200)
      await wrapper.vm.$nextTick()

      expect(wrapper.find('.popover').exists()).toBe(true)
      wrapper.unmount()
    })

    it('does not show popover if mouseleave fires before 200ms', async () => {
      mockGet.mockResolvedValue(alertsResponse([makeAlert('critical')]))
      const wrapper = mount(AlertBadge)
      await flushPromises()

      await wrapper.find('.alert-badge-wrapper').trigger('mouseenter')
      vi.advanceTimersByTime(100)
      await wrapper.find('.alert-badge-wrapper').trigger('mouseleave')
      vi.advanceTimersByTime(200)
      await wrapper.vm.$nextTick()

      expect(wrapper.find('.popover').exists()).toBe(false)
      wrapper.unmount()
    })

    it('hides popover after 300ms mouseleave', async () => {
      mockGet.mockResolvedValue(alertsResponse([makeAlert('warning')]))
      const wrapper = mount(AlertBadge)
      await flushPromises()

      // Show popover first
      await wrapper.find('.alert-badge-wrapper').trigger('mouseenter')
      vi.advanceTimersByTime(200)
      await wrapper.vm.$nextTick()
      expect(wrapper.find('.popover').exists()).toBe(true)

      // Mouse leave — popover should remain briefly
      await wrapper.find('.alert-badge-wrapper').trigger('mouseleave')
      vi.advanceTimersByTime(100)
      await wrapper.vm.$nextTick()
      expect(wrapper.find('.popover').exists()).toBe(true)

      // After 300ms it should hide
      vi.advanceTimersByTime(200)
      await wrapper.vm.$nextTick()
      expect(wrapper.find('.popover').exists()).toBe(false)
      wrapper.unmount()
    })

    it('keeps popover open if mouse re-enters during hide delay', async () => {
      mockGet.mockResolvedValue(alertsResponse([makeAlert('warning')]))
      const wrapper = mount(AlertBadge)
      await flushPromises()

      // Open popover
      await wrapper.find('.alert-badge-wrapper').trigger('mouseenter')
      vi.advanceTimersByTime(200)
      await wrapper.vm.$nextTick()

      // Leave then quickly re-enter before 300ms
      await wrapper.find('.alert-badge-wrapper').trigger('mouseleave')
      vi.advanceTimersByTime(100)
      await wrapper.find('.alert-badge-wrapper').trigger('mouseenter')
      vi.advanceTimersByTime(300)
      await wrapper.vm.$nextTick()

      expect(wrapper.find('.popover').exists()).toBe(true)
      wrapper.unmount()
    })
  })

  // ── Popover — keyboard / focus ─────────────────────────────────────────────

  describe('popover focus behavior', () => {
    it('shows popover immediately on focusin', async () => {
      mockGet.mockResolvedValue(alertsResponse([makeAlert('critical')]))
      const wrapper = mount(AlertBadge)
      await flushPromises()

      await wrapper.find('.alert-badge-wrapper').trigger('focusin')
      await wrapper.vm.$nextTick()

      expect(wrapper.find('.popover').exists()).toBe(true)
      wrapper.unmount()
    })

    it('hides popover immediately on focusout', async () => {
      mockGet.mockResolvedValue(alertsResponse([makeAlert('critical')]))
      const wrapper = mount(AlertBadge)
      await flushPromises()

      await wrapper.find('.alert-badge-wrapper').trigger('focusin')
      await wrapper.vm.$nextTick()
      expect(wrapper.find('.popover').exists()).toBe(true)

      await wrapper.find('.alert-badge-wrapper').trigger('focusout')
      await wrapper.vm.$nextTick()
      expect(wrapper.find('.popover').exists()).toBe(false)
      wrapper.unmount()
    })
  })

  // ── Popover — content ─────────────────────────────────────────────────────

  describe('popover content', () => {
    it('shows at most 3 alerts in popover', async () => {
      const manyAlerts = [
        makeAlert('critical', -1000),
        makeAlert('warning', -2000),
        makeAlert('warning', -3000),
        makeAlert('critical', -4000),
        makeAlert('warning', -5000),
      ]
      mockGet.mockResolvedValue(alertsResponse(manyAlerts))
      const wrapper = mount(AlertBadge)
      await flushPromises()

      await wrapper.find('.alert-badge-wrapper').trigger('focusin')
      await wrapper.vm.$nextTick()

      expect(wrapper.findAll('.popover-item')).toHaveLength(3)
      wrapper.unmount()
    })

    it('truncates long message to 80 characters + ellipsis', async () => {
      const longMsg = 'A'.repeat(100)
      const alert = { rule: 'long_rule', severity: 'warning' as const, message: longMsg, meta: {}, ts: NOW }
      mockGet.mockResolvedValue(alertsResponse([alert]))
      const wrapper = mount(AlertBadge)
      await flushPromises()

      await wrapper.find('.alert-badge-wrapper').trigger('focusin')
      await wrapper.vm.$nextTick()

      const msgEl = wrapper.find('.popover-msg')
      expect(msgEl.text()).toHaveLength(81) // 80 chars + '…'
      expect(msgEl.text()).toMatch(/…$/)
      wrapper.unmount()
    })

    it('shows friendly empty state when no recent alerts', async () => {
      mockGet.mockResolvedValue(emptyResponse())
      const wrapper = mount(AlertBadge)
      await flushPromises()

      await wrapper.find('.alert-badge-wrapper').trigger('focusin')
      await wrapper.vm.$nextTick()

      expect(wrapper.find('.popover-header').text()).toContain('目前無 alert')
      expect(wrapper.findAll('.popover-item')).toHaveLength(0)
      wrapper.unmount()
    })

    it('"顯示更多" button triggers same navigation as badge click', async () => {
      mockGet.mockResolvedValue(alertsResponse([makeAlert('critical')]))
      const wrapper = mount(AlertBadge)
      await flushPromises()

      await wrapper.find('.alert-badge-wrapper').trigger('focusin')
      await wrapper.vm.$nextTick()

      mockAppState.currentDesktopTab = 'logs'
      mockAppState.preferredMonitorSubTab = null

      await wrapper.find('.popover-more').trigger('click')

      expect(mockAppState.currentDesktopTab).toBe('monitor')
      expect(mockAppState.preferredMonitorSubTab).toBe('observability')
      wrapper.unmount()
    })

    it('popover has role="tooltip"', async () => {
      mockGet.mockResolvedValue(alertsResponse([makeAlert('warning')]))
      const wrapper = mount(AlertBadge)
      await flushPromises()

      await wrapper.find('.alert-badge-wrapper').trigger('focusin')
      await wrapper.vm.$nextTick()

      expect(wrapper.find('.popover').attributes('role')).toBe('tooltip')
      wrapper.unmount()
    })

    it('displays relative time for each alert', async () => {
      // Alert from 3 minutes ago
      const threeMinAgo = makeAlert('warning', -(3 * 60_000))
      mockGet.mockResolvedValue(alertsResponse([threeMinAgo]))
      const wrapper = mount(AlertBadge)
      await flushPromises()

      await wrapper.find('.alert-badge-wrapper').trigger('focusin')
      await wrapper.vm.$nextTick()

      expect(wrapper.find('.popover-time').text()).toBe('3m ago')
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

  // ── Desktop Notification API ───────────────────────────────────────────────
  //
  // Mock strategy:
  //   - `global.Notification` is replaced via vi.stubGlobal with a vi.fn()
  //     constructor spy. The static `permission` property is set via
  //     Object.defineProperty per-test to simulate different browser states.
  //   - `Notification.requestPermission` is assigned as a static vi.fn().
  //   - localStorage is replaced with an in-memory Map-backed stub per-test
  //     because happy-dom's localStorage may not expose all Storage methods.
  //
  describe('desktop notifications', () => {
    // Typed interface for the mock Notification surface
    interface NotificationLike {
      new (title: string, opts?: NotificationOptions): void
      permission: NotificationPermission
      requestPermission: () => Promise<NotificationPermission>
    }

    let NotificationMock: ReturnType<typeof vi.fn>
    let requestPermissionMock: ReturnType<typeof vi.fn>

    // Minimal localStorage stub backed by a Map
    function makeLocalStorageStub(initial: Record<string, string> = {}): Storage {
      const store = new Map<string, string>(Object.entries(initial))
      return {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => { store.set(k, v) },
        removeItem: (k: string) => { store.delete(k) },
        clear: () => { store.clear() },
        get length() { return store.size },
        key: (i: number) => [...store.keys()][i] ?? null,
      } as Storage
    }

    function setPermission(perm: NotificationPermission): void {
      Object.defineProperty(NotificationMock, 'permission', {
        value: perm,
        writable: true,
        configurable: true,
      })
      requestPermissionMock.mockResolvedValue(perm)
    }

    beforeEach(() => {
      // Build a fresh constructor mock and localStorage stub for each test
      NotificationMock = vi.fn()
      requestPermissionMock = vi.fn()
      // Assign requestPermission static via double cast to avoid TS error
      ;(NotificationMock as unknown as NotificationLike).requestPermission =
        requestPermissionMock as unknown as () => Promise<NotificationPermission>
      setPermission('default')

      // Stub globals
      vi.stubGlobal('Notification', NotificationMock)
      vi.stubGlobal('localStorage', makeLocalStorageStub())
    })

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    // 1. Load persisted enabled state from localStorage
    it('loads notificationsEnabled=true from localStorage on mount', async () => {
      setPermission('granted')
      vi.stubGlobal('localStorage', makeLocalStorageStub({ oc_desktop_notif_enabled: '1' }))
      mockGet.mockResolvedValue(emptyResponse())

      const wrapper = mount(AlertBadge)
      await flushPromises()

      // Open popover to see checkbox
      await wrapper.find('.alert-badge-wrapper').trigger('focusin')
      await wrapper.vm.$nextTick()

      const checkbox = wrapper.find<HTMLInputElement>('.notif-toggle-checkbox')
      expect(checkbox.element.checked).toBe(true)
      wrapper.unmount()
    })

    // 2. Toggle on with default permission → requestPermission is called
    it('calls requestPermission when toggle is enabled and permission is default', async () => {
      setPermission('default')
      mockGet.mockResolvedValue(emptyResponse())

      const wrapper = mount(AlertBadge)
      await flushPromises()

      await wrapper.find('.alert-badge-wrapper').trigger('focusin')
      await wrapper.vm.$nextTick()

      await wrapper.find('.notif-toggle-checkbox').trigger('change')
      await flushPromises()

      expect(requestPermissionMock).toHaveBeenCalledTimes(1)
      wrapper.unmount()
    })

    // 3. Toggle on + granted → new critical fires Notification constructor
    it('fires Notification when enabled, granted, and a new critical arrives', async () => {
      setPermission('granted')
      vi.stubGlobal('localStorage', makeLocalStorageStub({ oc_desktop_notif_enabled: '1' }))

      mockGet.mockResolvedValue(alertsResponse([makeAlert('critical')]))

      const wrapper = mount(AlertBadge)
      await flushPromises()

      // The watch fires after recentAlerts updates; constructor should be called
      expect(NotificationMock).toHaveBeenCalledTimes(1)
      expect(NotificationMock).toHaveBeenCalledWith(
        'Agent Monitor — Critical Alert',
        expect.objectContaining({ body: expect.any(String) }),
      )
      wrapper.unmount()
    })

    // 4. Same critical id is not re-notified on second poll
    it('does not re-fire Notification for a critical already in lastCriticalIds', async () => {
      setPermission('granted')
      vi.stubGlobal('localStorage', makeLocalStorageStub({ oc_desktop_notif_enabled: '1' }))

      const alert = makeAlert('critical')
      mockGet.mockResolvedValue(alertsResponse([alert]))

      const wrapper = mount(AlertBadge)
      await flushPromises()
      const firstCallCount = NotificationMock.mock.calls.length

      // Advance timer to trigger a second poll with the same alert
      vi.advanceTimersByTime(30_000)
      await flushPromises()

      // No additional notification should fire
      expect(NotificationMock.mock.calls.length).toBe(firstCallCount)
      wrapper.unmount()
    })

    // 5. Multiple new criticals in same batch → single merged notification
    it('fires a single merged Notification when multiple new criticals arrive at once', async () => {
      setPermission('granted')
      vi.stubGlobal('localStorage', makeLocalStorageStub({ oc_desktop_notif_enabled: '1' }))

      mockGet.mockResolvedValue(
        alertsResponse([
          makeAlert('critical', -1000),
          makeAlert('critical', -2000),
          makeAlert('critical', -3000),
        ]),
      )

      const wrapper = mount(AlertBadge)
      await flushPromises()

      // Should have fired exactly once (merged batch)
      expect(NotificationMock).toHaveBeenCalledTimes(1)
      // Body should reference "3 個 critical alerts"
      const callArgs = NotificationMock.mock.calls[0]
      expect(callArgs[1].body).toContain('3')
      wrapper.unmount()
    })

    // 6. Toggle off → Notification not fired even for new criticals
    it('does not fire Notification when notificationsEnabled is false', async () => {
      setPermission('granted')
      // Do NOT set localStorage (default is off)

      mockGet.mockResolvedValue(alertsResponse([makeAlert('critical')]))

      const wrapper = mount(AlertBadge)
      await flushPromises()

      expect(NotificationMock).not.toHaveBeenCalled()
      wrapper.unmount()
    })

    // 7. permission === 'denied' → warning message shown in popover
    it('shows blocked-permission warning when permission is denied', async () => {
      setPermission('denied')
      mockGet.mockResolvedValue(emptyResponse())

      const wrapper = mount(AlertBadge)
      await flushPromises()

      await wrapper.find('.alert-badge-wrapper').trigger('focusin')
      await wrapper.vm.$nextTick()

      const warning = wrapper.find('.notif-warning--blocked')
      expect(warning.exists()).toBe(true)
      expect(warning.text()).toContain('已封鎖通知')
      wrapper.unmount()
    })

    // 8. Notification not fired when permission is not 'granted' (even if enabled)
    it('does not fire Notification when permission is not granted', async () => {
      setPermission('default')
      vi.stubGlobal('localStorage', makeLocalStorageStub({ oc_desktop_notif_enabled: '1' }))

      mockGet.mockResolvedValue(alertsResponse([makeAlert('critical')]))

      const wrapper = mount(AlertBadge)
      await flushPromises()

      expect(NotificationMock).not.toHaveBeenCalled()
      wrapper.unmount()
    })
  })

  // ── Snooze ─────────────────────────────────────────────────────────────────

  describe('snooze', () => {
    interface NotificationLike {
      new (title: string, opts?: NotificationOptions): void
      permission: NotificationPermission
      requestPermission: () => Promise<NotificationPermission>
    }

    let NotificationMock: ReturnType<typeof vi.fn>
    let requestPermissionMock: ReturnType<typeof vi.fn>

    function makeLocalStorageStub(initial: Record<string, string> = {}): Storage {
      const store = new Map<string, string>(Object.entries(initial))
      return {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => { store.set(k, v) },
        removeItem: (k: string) => { store.delete(k) },
        clear: () => { store.clear() },
        get length() { return store.size },
        key: (i: number) => [...store.keys()][i] ?? null,
      } as Storage
    }

    function setPermission(perm: NotificationPermission): void {
      Object.defineProperty(NotificationMock, 'permission', {
        value: perm,
        writable: true,
        configurable: true,
      })
      requestPermissionMock.mockResolvedValue(perm)
    }

    beforeEach(() => {
      NotificationMock = vi.fn()
      requestPermissionMock = vi.fn()
      ;(NotificationMock as unknown as NotificationLike).requestPermission =
        requestPermissionMock as unknown as () => Promise<NotificationPermission>
      setPermission('granted')

      vi.stubGlobal('Notification', NotificationMock)
      vi.stubGlobal('localStorage', makeLocalStorageStub({ oc_desktop_notif_enabled: '1' }))
    })

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    // 1. setSnooze stores epoch ms in localStorage
    it('setSnooze stores epoch ms in localStorage', async () => {
      mockGet.mockResolvedValue(emptyResponse())

      const wrapper = mount(AlertBadge)
      await flushPromises()

      // Open popover then click snooze 30 min button
      await wrapper.find('.alert-badge-wrapper').trigger('focusin')
      await wrapper.vm.$nextTick()

      await wrapper.find('.snooze-btn').trigger('click') // first btn = 30 min
      await wrapper.vm.$nextTick()

      const stored = localStorage.getItem('oc_alert_notif_snooze_until')
      expect(stored).not.toBeNull()
      const storedMs = parseInt(stored!, 10)
      expect(storedMs).toBeGreaterThan(NOW)
      // Should be ~30 min in future
      expect(storedMs).toBeCloseTo(NOW + 30 * 60_000, -3)
      wrapper.unmount()
    })

    // 2. isSnoozed=true → desktop notification does not fire
    it('does not fire Notification when snoozed', async () => {
      // Pre-seed snooze in localStorage (60 min from now)
      const snoozeUntilMs = NOW + 60 * 60_000
      vi.stubGlobal('localStorage', makeLocalStorageStub({
        oc_desktop_notif_enabled: '1',
        oc_alert_notif_snooze_until: String(snoozeUntilMs),
      }))

      mockGet.mockResolvedValue(alertsResponse([makeAlert('critical')]))

      const wrapper = mount(AlertBadge)
      await flushPromises()

      expect(NotificationMock).not.toHaveBeenCalled()
      wrapper.unmount()
    })

    // 3. After snooze expires, isSnoozed becomes false (fake timer advances)
    it('isSnoozed becomes false after expiry when timer advances', async () => {
      // Snooze for 1 minute from now
      const snoozeUntilMs = NOW + 60_000
      vi.stubGlobal('localStorage', makeLocalStorageStub({
        oc_desktop_notif_enabled: '1',
        oc_alert_notif_snooze_until: String(snoozeUntilMs),
      }))

      mockGet.mockResolvedValue(emptyResponse())

      const wrapper = mount(AlertBadge)
      await flushPromises()

      // Advance system time past expiry and tick the interval
      vi.setSystemTime(NOW + 61_000)
      vi.advanceTimersByTime(2_000) // fire nowInterval ticks
      await wrapper.vm.$nextTick()

      // Open popover — snooze status header should not be shown
      await wrapper.find('.alert-badge-wrapper').trigger('focusin')
      await wrapper.vm.$nextTick()

      expect(wrapper.find('.snooze-status').exists()).toBe(false)
      wrapper.unmount()
    })

    // 4. cancelSnooze clears state and localStorage, notifications resume
    it('cancelSnooze clears snooze and allows notifications again', async () => {
      const snoozeUntilMs = NOW + 60 * 60_000
      vi.stubGlobal('localStorage', makeLocalStorageStub({
        oc_desktop_notif_enabled: '1',
        oc_alert_notif_snooze_until: String(snoozeUntilMs),
      }))

      mockGet.mockResolvedValue(emptyResponse())

      const wrapper = mount(AlertBadge)
      await flushPromises()

      // Open popover — snooze status should be visible
      await wrapper.find('.alert-badge-wrapper').trigger('focusin')
      await wrapper.vm.$nextTick()
      expect(wrapper.find('.snooze-status').exists()).toBe(true)

      // Click cancel
      await wrapper.find('.snooze-cancel-btn').trigger('click')
      await wrapper.vm.$nextTick()

      // Snooze status should be gone
      expect(wrapper.find('.snooze-status').exists()).toBe(false)

      // localStorage key should be removed
      expect(localStorage.getItem('oc_alert_notif_snooze_until')).toBeNull()
      wrapper.unmount()
    })

    // 5. Persisted snooze loads on mount (unexpired)
    it('loads unexpired snooze from localStorage on mount', async () => {
      const snoozeUntilMs = NOW + 30 * 60_000
      vi.stubGlobal('localStorage', makeLocalStorageStub({
        oc_desktop_notif_enabled: '1',
        oc_alert_notif_snooze_until: String(snoozeUntilMs),
      }))

      mockGet.mockResolvedValue(emptyResponse())

      const wrapper = mount(AlertBadge)
      await flushPromises()

      // Open popover
      await wrapper.find('.alert-badge-wrapper').trigger('focusin')
      await wrapper.vm.$nextTick()

      // Should show snooze status
      expect(wrapper.find('.snooze-status').exists()).toBe(true)
      expect(wrapper.find('.snooze-status').text()).toContain('靜音中')
      wrapper.unmount()
    })

    // 6. Expired snooze in localStorage is cleaned up on mount
    it('cleans up expired snooze from localStorage on mount', async () => {
      const expiredMs = NOW - 1000 // 1 second ago = expired
      vi.stubGlobal('localStorage', makeLocalStorageStub({
        oc_desktop_notif_enabled: '1',
        oc_alert_notif_snooze_until: String(expiredMs),
      }))

      mockGet.mockResolvedValue(emptyResponse())

      const wrapper = mount(AlertBadge)
      await flushPromises()

      // Open popover
      await wrapper.find('.alert-badge-wrapper').trigger('focusin')
      await wrapper.vm.$nextTick()

      // Should NOT show snooze status
      expect(wrapper.find('.snooze-status').exists()).toBe(false)
      // localStorage key should have been removed
      expect(localStorage.getItem('oc_alert_notif_snooze_until')).toBeNull()
      wrapper.unmount()
    })

    // 7. Snooze buttons only shown when notifications are enabled and not snoozed
    it('shows snooze buttons row when notifications enabled and not snoozed', async () => {
      mockGet.mockResolvedValue(emptyResponse())

      const wrapper = mount(AlertBadge)
      await flushPromises()

      await wrapper.find('.alert-badge-wrapper').trigger('focusin')
      await wrapper.vm.$nextTick()

      expect(wrapper.find('.popover-snooze-row').exists()).toBe(true)
      expect(wrapper.findAll('.snooze-btn')).toHaveLength(3)
      wrapper.unmount()
    })

    // 8. Snooze buttons hidden when already snoozed
    it('hides snooze buttons row when already snoozed', async () => {
      const snoozeUntilMs = NOW + 60 * 60_000
      vi.stubGlobal('localStorage', makeLocalStorageStub({
        oc_desktop_notif_enabled: '1',
        oc_alert_notif_snooze_until: String(snoozeUntilMs),
      }))

      mockGet.mockResolvedValue(emptyResponse())

      const wrapper = mount(AlertBadge)
      await flushPromises()

      await wrapper.find('.alert-badge-wrapper').trigger('focusin')
      await wrapper.vm.$nextTick()

      expect(wrapper.find('.popover-snooze-row').exists()).toBe(false)
      wrapper.unmount()
    })
  })

  // ── Audio cue ──────────────────────────────────────────────────────────────

  describe('audio cue', () => {
    // Shared AudioContext mock builder
    function makeAudioContextMock() {
      const oscillatorStop = vi.fn()
      const oscillatorStart = vi.fn()
      const oscillatorConnect = vi.fn()
      const gainConnect = vi.fn()
      const setValueAtTime = vi.fn()
      const exponentialRampToValueAtTime = vi.fn()
      const gainNode = {
        connect: gainConnect,
        gain: {
          setValueAtTime,
          exponentialRampToValueAtTime,
        },
      }
      const oscillatorNode = {
        connect: oscillatorConnect,
        start: oscillatorStart,
        stop: oscillatorStop,
        frequency: { value: 0 },
      }
      // Use a real class so `new MockAudioContext()` works correctly
      class MockAudioContext {
        destination = {}
        currentTime = 0
        createOscillator = vi.fn().mockReturnValue(oscillatorNode)
        createGain = vi.fn().mockReturnValue(gainNode)
      }
      const MockAudioContextSpy = vi.fn().mockImplementation(function(this: MockAudioContext) {
        Object.assign(this, new MockAudioContext())
      })
      return { MockAudioContext: MockAudioContextSpy, oscillatorStart, oscillatorStop }
    }

    function makeLocalStorageStub(initial: Record<string, string> = {}): Storage {
      const store = new Map<string, string>(Object.entries(initial))
      return {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => { store.set(k, v) },
        removeItem: (k: string) => { store.delete(k) },
        clear: () => { store.clear() },
        get length() { return store.size },
        key: (i: number) => [...store.keys()][i] ?? null,
      } as Storage
    }

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    // 1. audioEnabled loads true from localStorage on mount
    it('loads audioEnabled=true from localStorage on mount', async () => {
      vi.stubGlobal('localStorage', makeLocalStorageStub({ oc_alert_audio_enabled: '1' }))
      mockGet.mockResolvedValue(emptyResponse())

      const wrapper = mount(AlertBadge)
      await flushPromises()

      await wrapper.find('.alert-badge-wrapper').trigger('focusin')
      await wrapper.vm.$nextTick()

      const checkbox = wrapper.find<HTMLInputElement>('.audio-toggle-checkbox')
      expect(checkbox.element.checked).toBe(true)
      wrapper.unmount()
    })

    // 2. toggleAudio on → persists '1' to localStorage
    it('persists audioEnabled=true to localStorage when toggled on', async () => {
      const lsStub = makeLocalStorageStub()
      vi.stubGlobal('localStorage', lsStub)
      mockGet.mockResolvedValue(emptyResponse())

      const wrapper = mount(AlertBadge)
      await flushPromises()

      await wrapper.find('.alert-badge-wrapper').trigger('focusin')
      await wrapper.vm.$nextTick()

      await wrapper.find('.audio-toggle-checkbox').trigger('change')
      await wrapper.vm.$nextTick()

      expect(lsStub.getItem('oc_alert_audio_enabled')).toBe('1')
      wrapper.unmount()
    })

    // 3. new critical + audioEnabled=true + not snoozed → AudioContext instantiated and beep plays
    it('calls AudioContext and starts oscillator when new critical arrives with audioEnabled=true', async () => {
      const { MockAudioContext, oscillatorStart } = makeAudioContextMock()
      vi.stubGlobal('AudioContext', MockAudioContext)
      vi.stubGlobal('localStorage', makeLocalStorageStub({ oc_alert_audio_enabled: '1' }))
      mockGet.mockResolvedValue(alertsResponse([makeAlert('critical')]))

      const wrapper = mount(AlertBadge)
      await flushPromises()

      expect(MockAudioContext).toHaveBeenCalledTimes(1)
      expect(oscillatorStart).toHaveBeenCalledTimes(1)
      wrapper.unmount()
    })

    // 4. new critical + audioEnabled=false → no AudioContext instantiation
    it('does not play audio when audioEnabled=false', async () => {
      const { MockAudioContext } = makeAudioContextMock()
      vi.stubGlobal('AudioContext', MockAudioContext)
      vi.stubGlobal('localStorage', makeLocalStorageStub({ oc_alert_audio_enabled: '0' }))
      mockGet.mockResolvedValue(alertsResponse([makeAlert('critical')]))

      const wrapper = mount(AlertBadge)
      await flushPromises()

      expect(MockAudioContext).not.toHaveBeenCalled()
      wrapper.unmount()
    })

    // 5. snoozed + audioEnabled=true → no audio played
    it('does not play audio when snoozed even if audioEnabled=true', async () => {
      const { MockAudioContext } = makeAudioContextMock()
      vi.stubGlobal('AudioContext', MockAudioContext)
      vi.stubGlobal('localStorage', makeLocalStorageStub({
        oc_alert_audio_enabled: '1',
        oc_alert_notif_snooze_until: String(NOW + 60 * 60_000),
      }))
      mockGet.mockResolvedValue(alertsResponse([makeAlert('critical')]))

      const wrapper = mount(AlertBadge)
      await flushPromises()

      expect(MockAudioContext).not.toHaveBeenCalled()
      wrapper.unmount()
    })

    // 6. AudioContext constructor throws → silent (no unhandled error)
    it('does not throw when AudioContext constructor fails', async () => {
      vi.stubGlobal('AudioContext', vi.fn().mockImplementation(() => {
        throw new Error('AudioContext not available')
      }))
      vi.stubGlobal('localStorage', makeLocalStorageStub({ oc_alert_audio_enabled: '1' }))
      mockGet.mockResolvedValue(alertsResponse([makeAlert('critical')]))

      // Should not throw
      const wrapper = mount(AlertBadge)
      await flushPromises()

      // Component still renders normally
      expect(wrapper.find('.bell-icon').exists()).toBe(true)
      wrapper.unmount()
    })

    // 7. audio toggle checkbox renders in popover settings
    it('renders audio toggle checkbox in popover settings', async () => {
      mockGet.mockResolvedValue(emptyResponse())

      const wrapper = mount(AlertBadge)
      await flushPromises()

      await wrapper.find('.alert-badge-wrapper').trigger('focusin')
      await wrapper.vm.$nextTick()

      expect(wrapper.find('.audio-toggle-checkbox').exists()).toBe(true)
      expect(wrapper.find('.audio-toggle-label').exists()).toBe(true)
      wrapper.unmount()
    })
  })
})
