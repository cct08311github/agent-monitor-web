import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import type {
  ApiMetricsResponse,
  ApiErrorsResponse,
  AlertsRecentResponse,
  AlertConfigResponse,
} from '../ObservabilityTab.vue'

// ---------------------------------------------------------------------------
// Stub api composable
// ---------------------------------------------------------------------------

const mockGet = vi.fn()
const mockPatch = vi.fn()

vi.mock('@/composables/useApi', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    patch: (...args: unknown[]) => mockPatch(...args),
  },
  useApi: () => ({
    get: (...args: unknown[]) => mockGet(...args),
    patch: (...args: unknown[]) => mockPatch(...args),
  }),
}))

// ---------------------------------------------------------------------------
// Stub useToast
// ---------------------------------------------------------------------------

const mockShowToast = vi.fn()

vi.mock('@/composables/useToast', () => ({
  showToast: (...args: unknown[]) => mockShowToast(...args),
  useToast: () => ({ showToast: (...args: unknown[]) => mockShowToast(...args) }),
}))

// ---------------------------------------------------------------------------
// Sample fixtures
// ---------------------------------------------------------------------------

const metricsFixture: ApiMetricsResponse = {
  success: true,
  data: {
    metrics: {
      'GET /api/read/stream': {
        count: 42,
        p50: 10,
        p95: 80,
        p99: 200,
        min: 5,
        max: 300,
        mean: 25,
        errorCount: { '4xx': 1, '5xx': 0 },
      },
      'POST /api/control/restart': {
        count: 5,
        p50: 50,
        p95: 120,
        p99: 350,
        min: 40,
        max: 400,
        mean: 70,
        errorCount: { '4xx': 0, '5xx': 2 },
      },
    },
  },
}

const errorsFixture: ApiErrorsResponse = {
  success: true,
  data: {
    errors: [
      {
        timestamp: 1700000000000,
        requestId: 'abcdef1234567890',
        method: 'GET',
        path: '/api/read/metrics',
        statusCode: 500,
        error: 'Internal Server Error',
        durationMs: 123,
      },
      {
        timestamp: 1700000001000,
        requestId: 'fedcba0987654321',
        method: 'POST',
        path: '/api/control/agent',
        statusCode: 503,
        error: 'Service Unavailable',
        durationMs: 45,
      },
    ],
    total: 2,
  },
}

const emptyMetricsFixture: ApiMetricsResponse = {
  success: true,
  data: { metrics: {} },
}

const emptyErrorsFixture: ApiErrorsResponse = {
  success: true,
  data: { errors: [], total: 0 },
}

const alertsFixture: AlertsRecentResponse = {
  success: true,
  data: {
    alerts: [
      {
        rule: 'cpu_critical',
        severity: 'critical',
        message: 'CPU 96.5% — 超過危急閾值 95%',
        meta: { cpu: 96.5 },
        ts: 1700000000000,
      },
      {
        rule: 'memory_high',
        severity: 'warning',
        message: '記憶體 87.3% — 超過閾值 85%',
        meta: { memory: 87.3 },
        ts: 1700000001000,
      },
    ],
  },
}

const emptyAlertsFixture: AlertsRecentResponse = {
  success: true,
  data: { alerts: [] },
}

const alertConfigFixture: AlertConfigResponse = {
  success: true,
  data: {
    config: {
      rules: {
        cpu_high: { enabled: true, threshold: 80, severity: 'warning', label: 'CPU 偏高' },
        cpu_critical: { enabled: true, threshold: 95, severity: 'critical', label: 'CPU 危急' },
        memory_high: { enabled: true, threshold: 85, severity: 'warning', label: '記憶體偏高' },
        no_active_agents: { enabled: true, threshold: 0, severity: 'critical', label: 'Agent 全部離線' },
        cost_today_high: { enabled: true, threshold: 5, severity: 'warning', label: '今日成本偏高 (USD)' },
        error_rate_high: { enabled: true, threshold: 5, severity: 'warning', label: '5xx Error 激增（5 分鐘內）' },
        latency_p99_high: { enabled: false, threshold: 2000, severity: 'warning', label: 'API p99 latency 過高' },
      },
    },
  },
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setupMockBothSuccess() {
  mockGet.mockImplementation((url: string) => {
    if (url.includes('/api/read/metrics')) return Promise.resolve(metricsFixture)
    if (url.includes('/api/read/errors/recent')) return Promise.resolve(errorsFixture)
    if (url.includes('/api/alerts/recent')) return Promise.resolve(alertsFixture)
    if (url.includes('/api/alerts/config')) return Promise.resolve(alertConfigFixture)
    return Promise.reject(new Error('Unknown URL'))
  })
}

function setupMockBothEmpty() {
  mockGet.mockImplementation((url: string) => {
    if (url.includes('/api/read/metrics')) return Promise.resolve(emptyMetricsFixture)
    if (url.includes('/api/read/errors/recent')) return Promise.resolve(emptyErrorsFixture)
    if (url.includes('/api/alerts/recent')) return Promise.resolve(emptyAlertsFixture)
    if (url.includes('/api/alerts/config')) return Promise.resolve(alertConfigFixture)
    return Promise.reject(new Error('Unknown URL'))
  })
}

function setupMockBothError() {
  mockGet.mockRejectedValue(new Error('Network Error'))
}

// ---------------------------------------------------------------------------
// Silence timers to avoid leaking interval in tests
// ---------------------------------------------------------------------------

import ObservabilityTab from '../ObservabilityTab.vue'

describe('ObservabilityTab', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    mockPatch.mockResolvedValue({ success: true })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ── Metrics rendering ────────────────────────────────────────────────────

  describe('metrics rendering', () => {
    it('renders metrics table with endpoint rows', async () => {
      setupMockBothSuccess()
      const wrapper = mount(ObservabilityTab)
      await flushPromises()

      const text = wrapper.text()
      expect(text).toContain('GET /api/read/stream')
      expect(text).toContain('POST /api/control/restart')
      wrapper.unmount()
    })

    it('shows p99 column values in the table', async () => {
      setupMockBothSuccess()
      const wrapper = mount(ObservabilityTab)
      await flushPromises()

      const text = wrapper.text()
      expect(text).toContain('200ms')
      expect(text).toContain('350ms')
      wrapper.unmount()
    })

    it('shows 5xx error counts with non-zero styling', async () => {
      setupMockBothSuccess()
      const wrapper = mount(ObservabilityTab)
      await flushPromises()

      // POST /api/control/restart has 2 5xx errors — cell should have error class
      const errorCells = wrapper.findAll('.obs-td--error')
      expect(errorCells.some((c) => c.text() === '2')).toBe(true)
      wrapper.unmount()
    })

    it('renders "API Latency Metrics" section heading', async () => {
      setupMockBothSuccess()
      const wrapper = mount(ObservabilityTab)
      await flushPromises()

      expect(wrapper.text()).toContain('API Latency Metrics')
      wrapper.unmount()
    })
  })

  // ── Errors rendering ─────────────────────────────────────────────────────

  describe('errors rendering', () => {
    it('renders recent errors table rows', async () => {
      setupMockBothSuccess()
      const wrapper = mount(ObservabilityTab)
      await flushPromises()

      const text = wrapper.text()
      expect(text).toContain('/api/read/metrics')
      expect(text).toContain('/api/control/agent')
      wrapper.unmount()
    })

    it('truncates requestId to 8 characters', async () => {
      setupMockBothSuccess()
      const wrapper = mount(ObservabilityTab)
      await flushPromises()

      // 'abcdef1234567890' → 'abcdef12'
      expect(wrapper.text()).toContain('abcdef12')
      expect(wrapper.text()).not.toContain('abcdef1234567890')
      wrapper.unmount()
    })

    it('renders status codes in errors table', async () => {
      setupMockBothSuccess()
      const wrapper = mount(ObservabilityTab)
      await flushPromises()

      const text = wrapper.text()
      expect(text).toContain('500')
      expect(text).toContain('503')
      wrapper.unmount()
    })

    it('shows method badges', async () => {
      setupMockBothSuccess()
      const wrapper = mount(ObservabilityTab)
      await flushPromises()

      expect(wrapper.find('.obs-method--get').exists()).toBe(true)
      expect(wrapper.find('.obs-method--post').exists()).toBe(true)
      wrapper.unmount()
    })
  })

  // ── Empty states ─────────────────────────────────────────────────────────

  describe('empty states', () => {
    it('shows metrics empty state when no metrics', async () => {
      setupMockBothEmpty()
      const wrapper = mount(ObservabilityTab)
      await flushPromises()

      expect(wrapper.text()).toContain('No metrics yet')
      wrapper.unmount()
    })

    it('shows errors empty state when no errors', async () => {
      setupMockBothEmpty()
      const wrapper = mount(ObservabilityTab)
      await flushPromises()

      expect(wrapper.text()).toContain('No recent errors')
      wrapper.unmount()
    })
  })

  // ── Error states ─────────────────────────────────────────────────────────

  describe('error states', () => {
    it('shows error message when metrics API fails', async () => {
      mockGet.mockRejectedValue(new Error('Network Error'))
      const wrapper = mount(ObservabilityTab)
      await flushPromises()

      expect(wrapper.text()).toContain('Network Error')
      wrapper.unmount()
    })

    it('renders retry button on API error', async () => {
      setupMockBothError()
      const wrapper = mount(ObservabilityTab)
      await flushPromises()

      const retryBtns = wrapper.findAll('button').filter((b) => b.text() === 'Retry')
      expect(retryBtns.length).toBeGreaterThan(0)
      wrapper.unmount()
    })

    it('retry button triggers a new fetch', async () => {
      mockGet.mockRejectedValue(new Error('Network Error'))
      const wrapper = mount(ObservabilityTab)
      await flushPromises()

      // Now fix the mock and click retry
      setupMockBothEmpty()
      mockGet.mockClear()
      const retryBtn = wrapper.findAll('button').find((b) => b.text() === 'Retry')
      await retryBtn?.trigger('click')
      await flushPromises()

      expect(mockGet).toHaveBeenCalled()
      wrapper.unmount()
    })
  })

  // ── Manual refresh ───────────────────────────────────────────────────────

  describe('manual refresh', () => {
    it('refresh button triggers new fetch calls', async () => {
      setupMockBothSuccess()
      const wrapper = mount(ObservabilityTab)
      await flushPromises()

      mockGet.mockClear()
      const refreshBtn = wrapper.findAll('button').find((b) => b.text().includes('Refresh'))
      await refreshBtn?.trigger('click')
      await flushPromises()

      // metrics + errors + alerts/recent + alerts/config = 4 calls
      expect(mockGet).toHaveBeenCalledTimes(4)
      wrapper.unmount()
    })

    it('updates "Last updated" timestamp after refresh', async () => {
      setupMockBothSuccess()
      const wrapper = mount(ObservabilityTab)
      await flushPromises()

      // After initial load, lastUpdated should be set (not '—')
      const text = wrapper.text()
      expect(text).not.toContain('Last updated: —')
      wrapper.unmount()
    })
  })

  // ── Auto-refresh toggle ──────────────────────────────────────────────────

  describe('auto-refresh toggle', () => {
    it('auto-refresh is ON by default', () => {
      setupMockBothSuccess()
      const wrapper = mount(ObservabilityTab)

      const toggleBtn = wrapper.findAll('button').find((b) =>
        b.text().includes('Auto-refresh'),
      )
      expect(toggleBtn?.text()).toContain('ON')
      wrapper.unmount()
    })

    it('clicking toggle switches to OFF', async () => {
      setupMockBothSuccess()
      const wrapper = mount(ObservabilityTab)

      const toggleBtn = wrapper.findAll('button').find((b) =>
        b.text().includes('Auto-refresh'),
      )
      await toggleBtn?.trigger('click')

      expect(toggleBtn?.text()).toContain('OFF')
      wrapper.unmount()
    })

    it('clicking toggle twice returns to ON', async () => {
      setupMockBothSuccess()
      const wrapper = mount(ObservabilityTab)

      const toggleBtn = wrapper.findAll('button').find((b) =>
        b.text().includes('Auto-refresh'),
      )
      await toggleBtn?.trigger('click')
      await toggleBtn?.trigger('click')

      expect(toggleBtn?.text()).toContain('ON')
      wrapper.unmount()
    })

    it('does not trigger fetch on interval when auto-refresh is OFF', async () => {
      setupMockBothSuccess()
      const wrapper = mount(ObservabilityTab)
      await flushPromises()

      const toggleBtn = wrapper.findAll('button').find((b) =>
        b.text().includes('Auto-refresh'),
      )
      await toggleBtn?.trigger('click') // turn OFF

      mockGet.mockClear()
      vi.advanceTimersByTime(30_000)
      await flushPromises()

      expect(mockGet).not.toHaveBeenCalled()
      wrapper.unmount()
    })

    it('triggers fetch on interval when auto-refresh is ON', async () => {
      setupMockBothSuccess()
      const wrapper = mount(ObservabilityTab)
      await flushPromises()

      mockGet.mockClear()
      vi.advanceTimersByTime(10_000)
      await flushPromises()

      // Should have fetched metrics + errors + alerts/recent + alerts/config = 4 calls
      expect(mockGet).toHaveBeenCalledTimes(4)
      wrapper.unmount()
    })
  })

  // ── Sorting ──────────────────────────────────────────────────────────────

  describe('metrics sorting', () => {
    it('clicking a column header sorts by that column', async () => {
      setupMockBothSuccess()
      const wrapper = mount(ObservabilityTab)
      await flushPromises()

      // Click "Count" header
      const headers = wrapper.findAll('.obs-th--sortable')
      const countHeader = headers.find((h) => h.text().includes('Count'))
      await countHeader?.trigger('click')

      expect(wrapper.text()).toContain('Count')
      wrapper.unmount()
    })
  })

  // ── Alerts rendering ─────────────────────────────────────────────────────

  describe('alerts rendering', () => {
    it('renders alerts table with rule and message', async () => {
      setupMockBothSuccess()
      const wrapper = mount(ObservabilityTab)
      await flushPromises()

      const text = wrapper.text()
      expect(text).toContain('cpu_critical')
      expect(text).toContain('memory_high')
      expect(text).toContain('CPU 96.5% — 超過危急閾值 95%')
      wrapper.unmount()
    })

    it('shows alerts empty state when no alerts', async () => {
      setupMockBothEmpty()
      const wrapper = mount(ObservabilityTab)
      await flushPromises()

      expect(wrapper.text()).toContain('目前無 alert')
      wrapper.unmount()
    })

    it('shows alerts error state and retry button on network failure', async () => {
      mockGet.mockImplementation((url: string) => {
        if (url.includes('/api/alerts/recent')) return Promise.reject(new Error('Alert fetch failed'))
        if (url.includes('/api/read/metrics')) return Promise.resolve(emptyMetricsFixture)
        if (url.includes('/api/read/errors/recent')) return Promise.resolve(emptyErrorsFixture)
        if (url.includes('/api/alerts/config')) return Promise.resolve(alertConfigFixture)
        return Promise.reject(new Error('Unknown URL'))
      })
      const wrapper = mount(ObservabilityTab)
      await flushPromises()

      expect(wrapper.text()).toContain('Alert fetch failed')
      const retryBtns = wrapper.findAll('button').filter((b) => b.text() === 'Retry')
      expect(retryBtns.length).toBeGreaterThan(0)
      wrapper.unmount()
    })

    it('severity badge has correct class for critical and warning', async () => {
      setupMockBothSuccess()
      const wrapper = mount(ObservabilityTab)
      await flushPromises()

      const criticalBadge = wrapper.find('.severity-badge--critical')
      const warningBadge = wrapper.find('.severity-badge--warning')
      expect(criticalBadge.exists()).toBe(true)
      expect(warningBadge.exists()).toBe(true)
      wrapper.unmount()
    })

    it('alert config renders all 7 rules when thresholds panel is expanded', async () => {
      setupMockBothSuccess()
      const wrapper = mount(ObservabilityTab)
      await flushPromises()

      // Expand thresholds
      const toggleBtn = wrapper.findAll('button').find((b) => b.text().includes('Alert Thresholds'))
      await toggleBtn?.trigger('click')
      await flushPromises()

      const text = wrapper.text()
      expect(text).toContain('CPU 偏高')
      expect(text).toContain('CPU 危急')
      expect(text).toContain('記憶體偏高')
      expect(text).toContain('Agent 全部離線')
      expect(text).toContain('今日成本偏高 (USD)')
      expect(text).toContain('5xx Error 激增（5 分鐘內）')
      expect(text).toContain('API p99 latency 過高')
      wrapper.unmount()
    })
  })

  // ── Auto-refresh covers alerts ───────────────────────────────────────────

  describe('auto-refresh with alerts', () => {
    it('auto-refresh triggers all 4 endpoint fetches', async () => {
      setupMockBothSuccess()
      const wrapper = mount(ObservabilityTab)
      await flushPromises()

      mockGet.mockClear()
      vi.advanceTimersByTime(10_000)
      await flushPromises()

      // metrics + errors + alerts/recent + alerts/config = 4 calls
      expect(mockGet).toHaveBeenCalledTimes(4)
      wrapper.unmount()
    })
  })

  // ── Editable Alert Thresholds ────────────────────────────────────────────

  describe('editable alert thresholds', () => {
    async function mountWithThresholds() {
      setupMockBothSuccess()
      const wrapper = mount(ObservabilityTab)
      await flushPromises()
      // Expand thresholds panel
      const toggleBtn = wrapper.findAll('button').find((b) => b.text().includes('Alert Thresholds'))
      await toggleBtn?.trigger('click')
      await flushPromises()
      return wrapper
    }

    it('renders checkbox and number input for each of the 7 rules', async () => {
      const wrapper = await mountWithThresholds()

      const checkboxes = wrapper.findAll('.obs-checkbox')
      const numberInputs = wrapper.findAll('.obs-number-input')
      expect(checkboxes).toHaveLength(7)
      expect(numberInputs).toHaveLength(7)
      wrapper.unmount()
    })

    it('Save button is disabled initially (no dirty changes)', async () => {
      const wrapper = await mountWithThresholds()

      const saveBtn = wrapper.findAll('button').find((b) => b.text().includes('Save'))
      expect(saveBtn?.attributes('disabled')).toBeDefined()
      wrapper.unmount()
    })

    it('Save button enables after toggling a rule enabled checkbox', async () => {
      const wrapper = await mountWithThresholds()

      const firstCheckbox = wrapper.find('.obs-checkbox')
      // jsdom requires manually setting .checked before triggering 'change'
      ;(firstCheckbox.element as HTMLInputElement).checked = false
      await firstCheckbox.trigger('change')
      await wrapper.vm.$nextTick()

      const saveBtn = wrapper.findAll('button').find((b) => b.text().includes('Save'))
      // After dirty change, Save should be enabled
      expect(saveBtn?.attributes('disabled')).toBeUndefined()
      wrapper.unmount()
    })

    it('Save button enables after changing a threshold value', async () => {
      const wrapper = await mountWithThresholds()

      const firstInput = wrapper.find('.obs-number-input')
      await firstInput.setValue(99)
      await wrapper.vm.$nextTick()

      const saveBtn = wrapper.findAll('button').find((b) => b.text().includes('Save'))
      expect(saveBtn?.attributes('disabled')).toBeUndefined()
      wrapper.unmount()
    })

    it('Save success: calls PATCH, shows success toast, and re-fetches config', async () => {
      const wrapper = await mountWithThresholds()

      // Dirty up the form
      const firstInput = wrapper.find('.obs-number-input')
      await firstInput.setValue(99)
      await wrapper.vm.$nextTick()

      mockGet.mockClear()
      const saveBtn = wrapper.findAll('button').find((b) => b.text().includes('Save'))
      await saveBtn?.trigger('click')
      await flushPromises()

      expect(mockPatch).toHaveBeenCalledWith('/api/alerts/config', expect.objectContaining({ rules: expect.any(Object) }))
      expect(mockShowToast).toHaveBeenCalledWith('alert config 已更新', 'success')
      // re-fetches config
      expect(mockGet).toHaveBeenCalledWith(expect.stringContaining('/api/alerts/config'))
      wrapper.unmount()
    })

    it('Save failure: shows error toast and keeps editedConfig', async () => {
      const wrapper = await mountWithThresholds()

      // Dirty up the form
      const firstInput = wrapper.find('.obs-number-input')
      await firstInput.setValue(99)
      await wrapper.vm.$nextTick()

      // Make PATCH fail
      mockPatch.mockRejectedValueOnce(new Error('Server Error'))
      const saveBtn = wrapper.findAll('button').find((b) => b.text().includes('Save'))
      await saveBtn?.trigger('click')
      await flushPromises()

      expect(mockShowToast).toHaveBeenCalledWith('Server Error', 'error')
      // editedConfig should still have 99 (preserved for retry)
      const inputsAfter = wrapper.findAll('.obs-number-input')
      expect((inputsAfter[0].element as HTMLInputElement).value).toBe('99')
      wrapper.unmount()
    })

    it('Reset button reverts editedConfig to alertConfig and disables Save', async () => {
      const wrapper = await mountWithThresholds()

      // Dirty up the form
      const firstInput = wrapper.find('.obs-number-input')
      await firstInput.setValue(99)
      await wrapper.vm.$nextTick()

      const saveBtn = wrapper.findAll('button').find((b) => b.text().includes('Save'))
      expect(saveBtn?.attributes('disabled')).toBeUndefined()

      const resetBtn = wrapper.findAll('button').find((b) => b.text() === 'Reset')
      await resetBtn?.trigger('click')
      await wrapper.vm.$nextTick()

      // After reset, threshold should be back to 80 (cpu_high original)
      const inputsAfter = wrapper.findAll('.obs-number-input')
      expect((inputsAfter[0].element as HTMLInputElement).value).toBe('80')
      expect(saveBtn?.attributes('disabled')).toBeDefined()
      wrapper.unmount()
    })

    it('buildPatchBody only includes changed rules', async () => {
      const wrapper = await mountWithThresholds()

      // Change only the first rule threshold (cpu_high: 80 → 85)
      const firstInput = wrapper.find('.obs-number-input')
      await firstInput.setValue(85)
      await wrapper.vm.$nextTick()

      mockPatch.mockResolvedValueOnce({ success: true })
      const saveBtn = wrapper.findAll('button').find((b) => b.text().includes('Save'))
      await saveBtn?.trigger('click')
      await flushPromises()

      expect(mockPatch).toHaveBeenCalledTimes(1)
      const [, patchBody] = mockPatch.mock.calls[0] as [string, { rules: Record<string, unknown> }]
      // Should contain only cpu_high (changed), not other keys
      expect(Object.keys(patchBody.rules)).toEqual(['cpu_high'])
      expect(patchBody.rules['cpu_high']).toMatchObject({ threshold: 85 })
      wrapper.unmount()
    })

    it('shows "未儲存的變更" hint when there are dirty changes', async () => {
      const wrapper = await mountWithThresholds()

      expect(wrapper.text()).not.toContain('未儲存的變更')

      const firstInput = wrapper.find('.obs-number-input')
      await firstInput.setValue(99)
      await wrapper.vm.$nextTick()

      expect(wrapper.text()).toContain('未儲存的變更')
      wrapper.unmount()
    })

    it('cost_today_high rule uses step=0.01', async () => {
      const wrapper = await mountWithThresholds()

      // cost_today_high is 5th rule in fixture (index 4)
      const inputs = wrapper.findAll('.obs-number-input')
      // Find the one for cost_today_high by aria-label
      const costInput = inputs.find((i) => i.attributes('aria-label')?.includes('cost_today_high'))
      expect(costInput?.attributes('step')).toBe('0.01')
      wrapper.unmount()
    })
  })
})
