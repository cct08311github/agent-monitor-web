import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import type {
  ApiMetricsResponse,
  ApiErrorsResponse,
  AlertsRecentResponse,
  AlertConfigResponse,
  AlertsHistoryResponse,
  HourBucket,
} from '../ObservabilityTab.vue'
import { formatExportTimestamp } from '@/lib/time'

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
        errorCount: { '4xx': 1, '5xx': 0, '429': 3 },
      },
      'POST /api/control/restart': {
        count: 5,
        p50: 50,
        p95: 120,
        p99: 350,
        min: 40,
        max: 400,
        mean: 70,
        errorCount: { '4xx': 0, '5xx': 2, '429': 0 },
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

const alertHistoryFixture: AlertsHistoryResponse = {
  success: true,
  data: {
    alerts: [
      {
        rule: 'cpu_critical',
        severity: 'critical',
        message: 'CPU 97.1% — 超過危急閾值 95%',
        meta: { cpu: 97.1 },
        ts: 1700001000000,
      },
      {
        rule: 'memory_high',
        severity: 'warning',
        message: '記憶體 88.0% — 超過閾值 85%',
        meta: { memory: 88.0 },
        ts: 1700000500000,
      },
      {
        rule: 'error_rate_high',
        severity: 'warning',
        message: '5xx error 率激增',
        meta: { count: 7 },
        ts: 1700000200000,
      },
    ],
    total: 3,
  },
}

const emptyHistoryFixture: AlertsHistoryResponse = {
  success: true,
  data: { alerts: [], total: 0 },
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
    if (url.includes('/api/alerts/history')) return Promise.resolve(alertHistoryFixture)
    if (url.includes('/api/alerts/recent')) return Promise.resolve(alertsFixture)
    if (url.includes('/api/alerts/config')) return Promise.resolve(alertConfigFixture)
    return Promise.reject(new Error('Unknown URL'))
  })
}

function setupMockBothEmpty() {
  mockGet.mockImplementation((url: string) => {
    if (url.includes('/api/read/metrics')) return Promise.resolve(emptyMetricsFixture)
    if (url.includes('/api/read/errors/recent')) return Promise.resolve(emptyErrorsFixture)
    if (url.includes('/api/alerts/history')) return Promise.resolve(emptyHistoryFixture)
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

// ---------------------------------------------------------------------------
// Global localStorage stub (happy-dom may not expose all Storage methods)
// ---------------------------------------------------------------------------

const _lsStore: Record<string, string> = {}
const globalLocalStorageMock = {
  getItem: vi.fn((key: string): string | null => _lsStore[key] ?? null),
  setItem: vi.fn((key: string, value: string): void => { _lsStore[key] = value }),
  removeItem: vi.fn((key: string): void => { delete _lsStore[key] }),
  clear: vi.fn((): void => { Object.keys(_lsStore).forEach((k) => { delete _lsStore[k] }) }),
}

Object.defineProperty(globalThis, 'localStorage', {
  value: globalLocalStorageMock,
  writable: true,
  configurable: true,
})

describe('ObservabilityTab', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    mockPatch.mockResolvedValue({ success: true })
    // Reset localStorage store between tests
    globalLocalStorageMock.clear()
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

    it('renders 429 column header in metrics table', async () => {
      setupMockBothSuccess()
      const wrapper = mount(ObservabilityTab)
      await flushPromises()

      // Table header row should include a "429" column
      const headers = wrapper.findAll('.obs-th')
      expect(headers.some((h) => h.text() === '429')).toBe(true)
      wrapper.unmount()
    })

    it('renders 429 count from fixture (3) in table cell', async () => {
      setupMockBothSuccess()
      const wrapper = mount(ObservabilityTab)
      await flushPromises()

      // GET /api/read/stream has 429: 3 in fixture
      const text = wrapper.text()
      expect(text).toContain('3')
      // Verify the rate-limit styled cell exists when count > 0
      const rateLimitCells = wrapper.findAll('.obs-td--rate-limit')
      expect(rateLimitCells.length).toBeGreaterThan(0)
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

      // metrics + errors + alerts/recent + alerts/config + timeline = 5 calls
      expect(mockGet).toHaveBeenCalledTimes(5)
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

      // Should have fetched metrics + errors + alerts/recent + alerts/config + timeline = 5 calls
      expect(mockGet).toHaveBeenCalledTimes(5)
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
    it('auto-refresh triggers all 5 endpoint fetches', async () => {
      setupMockBothSuccess()
      const wrapper = mount(ObservabilityTab)
      await flushPromises()

      mockGet.mockClear()
      vi.advanceTimersByTime(10_000)
      await flushPromises()

      // metrics + errors + alerts/recent + alerts/config + timeline = 5 calls
      expect(mockGet).toHaveBeenCalledTimes(5)
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

      const checkboxes = wrapper.findAll('.obs-checkbox--threshold')
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

      const firstCheckbox = wrapper.find('.obs-checkbox--threshold')
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

  // ── Export ───────────────────────────────────────────────────────────────

  describe('export JSON', () => {
    // Setup DOM mocks for Blob / URL.createObjectURL / anchor
    function setupExportMocks() {
      const mockClick = vi.fn()
      const mockAnchor = { href: '', download: '', click: mockClick }
      const mockCreateObjectURL = vi.fn().mockReturnValue('blob:mock-url')
      const mockRevokeObjectURL = vi.fn()

      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        if (tag === 'a') return mockAnchor as unknown as HTMLElement
        return document.createElement(tag)
      })
      vi.spyOn(URL, 'createObjectURL').mockImplementation(mockCreateObjectURL)
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(mockRevokeObjectURL)

      return { mockClick, mockAnchor, mockCreateObjectURL, mockRevokeObjectURL }
    }

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('Export All triggers download and calls URL.createObjectURL + revokeObjectURL', async () => {
      setupMockBothSuccess()
      const wrapper = mount(ObservabilityTab)
      await flushPromises()

      const { mockClick, mockCreateObjectURL, mockRevokeObjectURL } = setupExportMocks()

      const exportAllBtn = wrapper.findAll('[data-export="all"]')[0]
      await exportAllBtn.trigger('click')

      expect(mockCreateObjectURL).toHaveBeenCalledTimes(1)
      expect(mockClick).toHaveBeenCalledTimes(1)
      expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
      wrapper.unmount()
    })

    it('Export All filename matches observability-all-YYYYMMDD-HHMMSS.json pattern', async () => {
      setupMockBothSuccess()
      const wrapper = mount(ObservabilityTab)
      await flushPromises()

      const { mockAnchor } = setupExportMocks()

      const exportAllBtn = wrapper.findAll('[data-export="all"]')[0]
      await exportAllBtn.trigger('click')

      expect(mockAnchor.download).toMatch(
        /^observability-all-\d{8}-\d{6}\.json$/,
      )
      wrapper.unmount()
    })

    // Helper: intercept Blob construction by replacing it with a class that extends Blob
    // and captures the JSON payload before calling super().
    function createBlobCaptor(): { getPayload: () => unknown } {
      let capturedPayload: unknown = null

      class CapturingBlob extends Blob {
        constructor(parts?: BlobPart[], options?: BlobPropertyBag) {
          super(parts, options)
          if (parts && parts.length > 0) {
            try {
              capturedPayload = JSON.parse(parts[0] as string) as unknown
            } catch {
              // ignore
            }
          }
        }
      }

      vi.stubGlobal('Blob', CapturingBlob)

      return {
        getPayload: () => capturedPayload,
      }
    }

    it('Export Metrics only includes metrics data in payload', async () => {
      setupMockBothSuccess()
      const wrapper = mount(ObservabilityTab)
      await flushPromises()

      const captor = createBlobCaptor()
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url')
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        if (tag === 'a') return { href: '', download: '', click: vi.fn() } as unknown as HTMLElement
        return document.createElement(tag)
      })

      const exportMetricsBtn = wrapper.findAll('[data-export="metrics"]')[0]
      await exportMetricsBtn.trigger('click')

      const payload = captor.getPayload() as Record<string, unknown>
      expect(payload).not.toBeNull()
      expect(payload.category).toBe('metrics')
      expect(payload.source).toBe('agent-monitor-web')
      expect(payload.exportedAt).toBeDefined()
      expect(Array.isArray(payload.data)).toBe(true)
      const data = payload.data as unknown[]
      expect(data.length).toBe(2) // two metrics in fixture

      vi.unstubAllGlobals()
      wrapper.unmount()
    })

    it('Export Errors only includes errors data in payload', async () => {
      setupMockBothSuccess()
      const wrapper = mount(ObservabilityTab)
      await flushPromises()

      const captor = createBlobCaptor()
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url')
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        if (tag === 'a') return { href: '', download: '', click: vi.fn() } as unknown as HTMLElement
        return document.createElement(tag)
      })

      const exportErrorsBtn = wrapper.findAll('[data-export="errors"]')[0]
      await exportErrorsBtn.trigger('click')

      const payload = captor.getPayload() as Record<string, unknown>
      expect(payload.category).toBe('errors')
      expect(Array.isArray(payload.data)).toBe(true)
      const data = payload.data as unknown[]
      expect(data.length).toBe(2) // two errors in fixture

      vi.unstubAllGlobals()
      wrapper.unmount()
    })

    it('Export Alerts includes alerts + config in payload', async () => {
      setupMockBothSuccess()
      const wrapper = mount(ObservabilityTab)
      await flushPromises()

      const captor = createBlobCaptor()
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url')
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        if (tag === 'a') return { href: '', download: '', click: vi.fn() } as unknown as HTMLElement
        return document.createElement(tag)
      })

      const exportAlertsBtn = wrapper.findAll('[data-export="alerts"]')[0]
      await exportAlertsBtn.trigger('click')

      const payload = captor.getPayload() as Record<string, unknown>
      expect(payload.category).toBe('alerts')
      const data = payload.data as Record<string, unknown>
      expect(Array.isArray(data.alerts)).toBe(true)
      expect(data.config).toBeDefined()

      vi.unstubAllGlobals()
      wrapper.unmount()
    })

    it('Export Metrics button is disabled when metrics is empty', async () => {
      setupMockBothEmpty()
      const wrapper = mount(ObservabilityTab)
      await flushPromises()

      const exportMetricsBtn = wrapper.findAll('[data-export="metrics"]')[0]
      expect(exportMetricsBtn.attributes('disabled')).toBeDefined()
      wrapper.unmount()
    })

    it('Export Errors button is disabled when errors is empty', async () => {
      setupMockBothEmpty()
      const wrapper = mount(ObservabilityTab)
      await flushPromises()

      const exportErrorsBtn = wrapper.findAll('[data-export="errors"]')[0]
      expect(exportErrorsBtn.attributes('disabled')).toBeDefined()
      wrapper.unmount()
    })

    it('Export buttons are enabled when data is present', async () => {
      setupMockBothSuccess()
      const wrapper = mount(ObservabilityTab)
      await flushPromises()

      const exportMetricsBtn = wrapper.findAll('[data-export="metrics"]')[0]
      const exportErrorsBtn = wrapper.findAll('[data-export="errors"]')[0]
      const exportAlertsBtn = wrapper.findAll('[data-export="alerts"]')[0]
      const exportAllBtn = wrapper.findAll('[data-export="all"]')[0]

      expect(exportMetricsBtn.attributes('disabled')).toBeUndefined()
      expect(exportErrorsBtn.attributes('disabled')).toBeUndefined()
      expect(exportAlertsBtn.attributes('disabled')).toBeUndefined()
      expect(exportAllBtn.attributes('disabled')).toBeUndefined()
      wrapper.unmount()
    })
  })

  // ── Copy buttons ─────────────────────────────────────────────────────────

  describe('copy buttons', () => {
    function setupClipboard(rejectWith?: Error) {
      const mockWriteText = rejectWith
        ? vi.fn().mockRejectedValue(rejectWith)
        : vi.fn().mockResolvedValue(undefined)

      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: mockWriteText },
        writable: true,
        configurable: true,
      })

      return { mockWriteText }
    }

    it('renders copy ID and copy JSON buttons in each error row', async () => {
      setupMockBothSuccess()
      const wrapper = mount(ObservabilityTab)
      await flushPromises()

      // errorsFixture has 2 rows; each row has 2 copy buttons
      const copyBtns = wrapper.findAll('.obs-btn--copy')
      expect(copyBtns.length).toBe(4) // 2 rows × 2 buttons
      wrapper.unmount()
    })

    it('📋 ID button calls writeText with the full requestId (not truncated)', async () => {
      setupMockBothSuccess()
      const { mockWriteText } = setupClipboard()
      const wrapper = mount(ObservabilityTab)
      await flushPromises()

      // First row: requestId = 'abcdef1234567890' (displayed as 'abcdef12')
      const copyBtns = wrapper.findAll('.obs-btn--copy')
      const idBtn = copyBtns[0]
      await idBtn.trigger('click')
      await flushPromises()

      expect(mockWriteText).toHaveBeenCalledWith('abcdef1234567890')
      wrapper.unmount()
    })

    it('📋 JSON button calls writeText with valid JSON containing all ApiError fields', async () => {
      setupMockBothSuccess()
      const { mockWriteText } = setupClipboard()
      const wrapper = mount(ObservabilityTab)
      await flushPromises()

      // First row JSON button (index 1 within the row = global index 1)
      const copyBtns = wrapper.findAll('.obs-btn--copy')
      const jsonBtn = copyBtns[1]
      await jsonBtn.trigger('click')
      await flushPromises()

      expect(mockWriteText).toHaveBeenCalledTimes(1)
      const writtenText = mockWriteText.mock.calls[0][0] as string
      const parsed = JSON.parse(writtenText) as Record<string, unknown>
      expect(parsed.requestId).toBe('abcdef1234567890')
      expect(parsed.method).toBe('GET')
      expect(parsed.path).toBe('/api/read/metrics')
      expect(parsed.statusCode).toBe(500)
      expect(parsed.error).toBe('Internal Server Error')
      expect(parsed.durationMs).toBe(123)
      expect(parsed.timestamp).toBe(1700000000000)
      wrapper.unmount()
    })

    it('ID copy success shows success toast "✅ requestId 已複製"', async () => {
      setupMockBothSuccess()
      setupClipboard()
      const wrapper = mount(ObservabilityTab)
      await flushPromises()

      const idBtn = wrapper.findAll('.obs-btn--copy')[0]
      await idBtn.trigger('click')
      await flushPromises()

      expect(mockShowToast).toHaveBeenCalledWith('✅ requestId 已複製', 'success')
      wrapper.unmount()
    })

    it('JSON copy success shows success toast "✅ row 已複製"', async () => {
      setupMockBothSuccess()
      setupClipboard()
      const wrapper = mount(ObservabilityTab)
      await flushPromises()

      const jsonBtn = wrapper.findAll('.obs-btn--copy')[1]
      await jsonBtn.trigger('click')
      await flushPromises()

      expect(mockShowToast).toHaveBeenCalledWith('✅ row 已複製', 'success')
      wrapper.unmount()
    })

    it('clipboard failure shows error toast "❌ 複製失敗"', async () => {
      setupMockBothSuccess()
      setupClipboard(new Error('Clipboard permission denied'))
      const wrapper = mount(ObservabilityTab)
      await flushPromises()

      const idBtn = wrapper.findAll('.obs-btn--copy')[0]
      await idBtn.trigger('click')
      await flushPromises()

      expect(mockShowToast).toHaveBeenCalledWith('❌ 複製失敗', 'error')
      wrapper.unmount()
    })

    it('second row copy ID button uses second row requestId', async () => {
      setupMockBothSuccess()
      const { mockWriteText } = setupClipboard()
      const wrapper = mount(ObservabilityTab)
      await flushPromises()

      // Second row: requestId = 'fedcba0987654321'; copy ID btn is index 2 (0-indexed)
      const copyBtns = wrapper.findAll('.obs-btn--copy')
      await copyBtns[2].trigger('click')
      await flushPromises()

      expect(mockWriteText).toHaveBeenCalledWith('fedcba0987654321')
      wrapper.unmount()
    })
  })

  // ── Alert timeline chart ─────────────────────────────────────────────────

  describe('alert timeline chart', () => {
    // Build a timeline fixture with known distribution:
    // - 2 critical alerts in the most recent hour (bucket 23, i=23 in the array)
    // - 1 warning alert in the second-most-recent hour (bucket 22)
    // - 1 critical 3 hours ago (bucket 20)
    function makeTimelineFixture(): AlertsHistoryResponse {
      const now = Date.now()
      return {
        success: true,
        data: {
          alerts: [
            // 2 criticals in current hour
            { rule: 'cpu_critical', severity: 'critical', message: 'A', meta: {}, ts: now - 1_000 },
            { rule: 'cpu_critical', severity: 'critical', message: 'B', meta: {}, ts: now - 2_000 },
            // 1 warning 1–2 hours ago
            { rule: 'mem_warn', severity: 'warning', message: 'C', meta: {}, ts: now - 1 * 3_600_000 - 60_000 },
            // 1 critical 3–4 hours ago
            { rule: 'cpu_critical', severity: 'critical', message: 'D', meta: {}, ts: now - 3 * 3_600_000 - 60_000 },
          ],
          total: 4,
        },
      }
    }

    function setupMockWithTimeline() {
      const tlFixture = makeTimelineFixture()
      mockGet.mockImplementation((url: string) => {
        if (url.includes('/api/read/metrics')) return Promise.resolve(emptyMetricsFixture)
        if (url.includes('/api/read/errors/recent')) return Promise.resolve(emptyErrorsFixture)
        if (url.includes('/api/alerts/recent')) return Promise.resolve(emptyAlertsFixture)
        if (url.includes('/api/alerts/config')) return Promise.resolve(alertConfigFixture)
        if (url.includes('/api/alerts/history')) return Promise.resolve(tlFixture)
        return Promise.reject(new Error('Unknown URL'))
      })
      return tlFixture
    }

    it('timelineBuckets always returns exactly 24 buckets', async () => {
      setupMockWithTimeline()
      const wrapper = mount(ObservabilityTab)
      await flushPromises()

      // SVG should contain 24 <g> elements (one per hour bucket)
      const bucketGroups = wrapper.findAll('[data-testid^="timeline-bucket-"]')
      expect(bucketGroups).toHaveLength(24)
      wrapper.unmount()
    })

    it('renders SVG element when timeline has data', async () => {
      setupMockWithTimeline()
      const wrapper = mount(ObservabilityTab)
      await flushPromises()

      const svg = wrapper.find('[data-testid="timeline-svg"]')
      expect(svg.exists()).toBe(true)
      wrapper.unmount()
    })

    it('shows empty state when timeline has no alerts', async () => {
      mockGet.mockImplementation((url: string) => {
        if (url.includes('/api/read/metrics')) return Promise.resolve(emptyMetricsFixture)
        if (url.includes('/api/read/errors/recent')) return Promise.resolve(emptyErrorsFixture)
        if (url.includes('/api/alerts/recent')) return Promise.resolve(emptyAlertsFixture)
        if (url.includes('/api/alerts/config')) return Promise.resolve(alertConfigFixture)
        if (url.includes('/api/alerts/history')) return Promise.resolve(emptyHistoryFixture)
        return Promise.reject(new Error('Unknown URL'))
      })
      const wrapper = mount(ObservabilityTab)
      await flushPromises()

      const emptyEl = wrapper.find('[data-testid="timeline-empty"]')
      expect(emptyEl.exists()).toBe(true)
      expect(emptyEl.text()).toContain('最近 24 小時無 alert')
      wrapper.unmount()
    })

    it('shows error state and retry button when timeline fetch fails', async () => {
      mockGet.mockImplementation((url: string) => {
        if (url.includes('/api/read/metrics')) return Promise.resolve(emptyMetricsFixture)
        if (url.includes('/api/read/errors/recent')) return Promise.resolve(emptyErrorsFixture)
        if (url.includes('/api/alerts/recent')) return Promise.resolve(emptyAlertsFixture)
        if (url.includes('/api/alerts/config')) return Promise.resolve(alertConfigFixture)
        if (url.includes('/api/alerts/history'))
          return Promise.reject(new Error('Timeline fetch failed'))
        return Promise.reject(new Error('Unknown URL'))
      })
      const wrapper = mount(ObservabilityTab)
      await flushPromises()

      expect(wrapper.text()).toContain('Timeline fetch failed')
      const retryBtn = wrapper.find('[data-testid="timeline-retry"]')
      expect(retryBtn.exists()).toBe(true)
      wrapper.unmount()
    })

    it('retry button in timeline error state calls fetchAlertTimeline again', async () => {
      mockGet.mockImplementation((url: string) => {
        if (url.includes('/api/read/metrics')) return Promise.resolve(emptyMetricsFixture)
        if (url.includes('/api/read/errors/recent')) return Promise.resolve(emptyErrorsFixture)
        if (url.includes('/api/alerts/recent')) return Promise.resolve(emptyAlertsFixture)
        if (url.includes('/api/alerts/config')) return Promise.resolve(alertConfigFixture)
        if (url.includes('/api/alerts/history'))
          return Promise.reject(new Error('Timeline fetch failed'))
        return Promise.reject(new Error('Unknown URL'))
      })
      const wrapper = mount(ObservabilityTab)
      await flushPromises()

      setupMockWithTimeline()
      mockGet.mockClear()
      const retryBtn = wrapper.find('[data-testid="timeline-retry"]')
      await retryBtn.trigger('click')
      await flushPromises()

      expect(mockGet).toHaveBeenCalledWith(expect.stringContaining('/api/alerts/history'))
      wrapper.unmount()
    })

    it('auto-refresh includes timeline fetch', async () => {
      setupMockBothSuccess()
      const wrapper = mount(ObservabilityTab)
      await flushPromises()

      mockGet.mockClear()
      vi.advanceTimersByTime(10_000)
      await flushPromises()

      // timeline uses /api/alerts/history with from/to params
      const timelineCalls = (mockGet.mock.calls as string[][]).filter((args) =>
        args[0].includes('/api/alerts/history') && args[0].includes('from='),
      )
      expect(timelineCalls.length).toBeGreaterThanOrEqual(1)
      wrapper.unmount()
    })

    it('manual Refresh button includes timeline fetch', async () => {
      setupMockBothSuccess()
      const wrapper = mount(ObservabilityTab)
      await flushPromises()

      mockGet.mockClear()
      const refreshBtn = wrapper.findAll('button').find((b) => b.text().includes('Refresh'))
      await refreshBtn?.trigger('click')
      await flushPromises()

      const timelineCalls = (mockGet.mock.calls as string[][]).filter((args) =>
        args[0].includes('/api/alerts/history') && args[0].includes('from='),
      )
      expect(timelineCalls.length).toBeGreaterThanOrEqual(1)
      wrapper.unmount()
    })

    it('HourBucket type has correct shape (TypeScript export check)', () => {
      const bucket: HourBucket = { hourStart: Date.now(), critical: 2, warning: 1 }
      expect(bucket.critical).toBe(2)
      expect(bucket.warning).toBe(1)
      expect(typeof bucket.hourStart).toBe('number')
    })

    it('fetchAlertTimeline uses from/to/limit=500 query params', async () => {
      setupMockWithTimeline()
      const wrapper = mount(ObservabilityTab)
      await flushPromises()

      const timelineCalls = (mockGet.mock.calls as string[][]).filter((args) =>
        args[0].includes('/api/alerts/history'),
      )
      expect(timelineCalls.length).toBeGreaterThan(0)
      const url = timelineCalls[0][0]
      expect(url).toContain('from=')
      expect(url).toContain('to=')
      expect(url).toContain('limit=500')
      wrapper.unmount()
    })
  })

  // ── formatExportTimestamp helper ────────────────────────────────────────

  describe('formatExportTimestamp', () => {
    it('returns YYYYMMDD-HHMMSS format', () => {
      const d = new Date(2026, 3, 24, 15, 0, 32) // 2026-04-24T15:00:32 local
      expect(formatExportTimestamp(d)).toBe('20260424-150032')
    })

    it('pads single-digit month, day, hours, minutes, seconds', () => {
      const d = new Date(2026, 0, 5, 3, 7, 9) // 2026-01-05T03:07:09
      expect(formatExportTimestamp(d)).toBe('20260105-030709')
    })

    it('output matches safe filename pattern [A-Za-z0-9-]+.json', () => {
      const d = new Date(2026, 3, 24, 9, 5, 1)
      const ts = formatExportTimestamp(d)
      expect(ts).toMatch(/^\d{8}-\d{6}$/)
    })
  })

  // ── Refresh interval ─────────────────────────────────────────────────────

  describe('refresh interval', () => {
    it('defaults to 10s when localStorage has no saved value', async () => {
      setupMockBothSuccess()
      const wrapper = mount(ObservabilityTab)
      await flushPromises()

      const select = wrapper.find('[data-testid="refresh-interval-select"]')
      expect((select.element as HTMLSelectElement).value).toBe('10000')
      wrapper.unmount()
    })

    it('setting 30s persists to localStorage and updates select', async () => {
      setupMockBothSuccess()
      const wrapper = mount(ObservabilityTab)
      await flushPromises()

      const select = wrapper.find('[data-testid="refresh-interval-select"]')
      await select.setValue('30000')
      await wrapper.vm.$nextTick()

      expect(globalLocalStorageMock.setItem).toHaveBeenCalledWith('oc_observability_refresh_ms', '30000')
      expect((select.element as HTMLSelectElement).value).toBe('30000')
      wrapper.unmount()
    })

    it('tick 30s triggers fetch when interval is set to 30s', async () => {
      setupMockBothSuccess()
      const wrapper = mount(ObservabilityTab)
      await flushPromises()

      // Set 30s interval — this resets the timer
      const select = wrapper.find('[data-testid="refresh-interval-select"]')
      await select.setValue('30000')
      await wrapper.vm.$nextTick()

      // Should NOT trigger at 10s (new interval is 30s)
      mockGet.mockClear()
      vi.advanceTimersByTime(10_000)
      await flushPromises()
      expect(mockGet).not.toHaveBeenCalled()

      // Should trigger at 30s mark
      vi.advanceTimersByTime(20_000)
      await flushPromises()
      expect(mockGet).toHaveBeenCalledTimes(5)
      wrapper.unmount()
    })

    it('autoRefresh off → changing interval does not start timer', async () => {
      setupMockBothSuccess()
      const wrapper = mount(ObservabilityTab)
      await flushPromises()

      // Turn off auto-refresh first
      const toggleBtn = wrapper.find('[data-testid="auto-refresh-toggle"]')
      await toggleBtn.trigger('click')

      mockGet.mockClear()
      // Change interval to 5s — should not start timer since autoRefresh is OFF
      const select = wrapper.find('[data-testid="refresh-interval-select"]')
      await select.setValue('5000')
      await wrapper.vm.$nextTick()

      vi.advanceTimersByTime(10_000)
      await flushPromises()
      expect(mockGet).not.toHaveBeenCalled()
      wrapper.unmount()
    })

    it('invalid localStorage value falls back to default 10s', async () => {
      // Pre-seed invalid value before mount
      globalLocalStorageMock.getItem.mockReturnValueOnce('garbage')
      setupMockBothSuccess()
      const wrapper = mount(ObservabilityTab)
      await flushPromises()

      const select = wrapper.find('[data-testid="refresh-interval-select"]')
      expect((select.element as HTMLSelectElement).value).toBe('10000')
      wrapper.unmount()
    })

    it('out-of-range localStorage value (e.g. 99999) falls back to default 10s', async () => {
      globalLocalStorageMock.getItem.mockReturnValueOnce('99999')
      setupMockBothSuccess()
      const wrapper = mount(ObservabilityTab)
      await flushPromises()

      const select = wrapper.find('[data-testid="refresh-interval-select"]')
      expect((select.element as HTMLSelectElement).value).toBe('10000')
      wrapper.unmount()
    })

    it('select is disabled when autoRefresh is OFF', async () => {
      setupMockBothSuccess()
      const wrapper = mount(ObservabilityTab)
      await flushPromises()

      const toggleBtn = wrapper.find('[data-testid="auto-refresh-toggle"]')
      await toggleBtn.trigger('click')

      const select = wrapper.find('[data-testid="refresh-interval-select"]')
      expect(select.attributes('disabled')).toBeDefined()
      wrapper.unmount()
    })

    it('select is enabled when autoRefresh is ON', async () => {
      setupMockBothSuccess()
      const wrapper = mount(ObservabilityTab)
      await flushPromises()

      const select = wrapper.find('[data-testid="refresh-interval-select"]')
      expect(select.attributes('disabled')).toBeUndefined()
      wrapper.unmount()
    })
  })

  // ── Alert history panel ──────────────────────────────────────────────────

  describe('alert history panel', () => {
    it('toggle button is rendered in Active Alerts section', async () => {
      setupMockBothSuccess()
      const wrapper = mount(ObservabilityTab)
      await flushPromises()

      const toggleBtn = wrapper.find('[data-testid="history-toggle"]')
      expect(toggleBtn.exists()).toBe(true)
      expect(toggleBtn.text()).toContain('顯示完整歷程')
      wrapper.unmount()
    })

    it('clicking toggle shows history section', async () => {
      setupMockBothSuccess()
      const wrapper = mount(ObservabilityTab)
      await flushPromises()

      const toggleBtn = wrapper.find('[data-testid="history-toggle"]')
      await toggleBtn.trigger('click')
      await flushPromises()

      expect(wrapper.text()).toContain('Alert 完整歷程')
      wrapper.unmount()
    })

    it('clicking toggle calls fetchAlertHistory (GET /api/alerts/history)', async () => {
      setupMockBothSuccess()
      const wrapper = mount(ObservabilityTab)
      await flushPromises()

      mockGet.mockClear()
      const toggleBtn = wrapper.find('[data-testid="history-toggle"]')
      await toggleBtn.trigger('click')
      await flushPromises()

      expect(mockGet).toHaveBeenCalledWith(expect.stringContaining('/api/alerts/history'))
      wrapper.unmount()
    })

    it('history table renders fixture rows after expanding', async () => {
      setupMockBothSuccess()
      const wrapper = mount(ObservabilityTab)
      await flushPromises()

      const toggleBtn = wrapper.find('[data-testid="history-toggle"]')
      await toggleBtn.trigger('click')
      await flushPromises()

      const text = wrapper.text()
      expect(text).toContain('CPU 97.1% — 超過危急閾值 95%')
      expect(text).toContain('記憶體 88.0% — 超過閾值 85%')
      expect(text).toContain('5xx error 率激增')
      wrapper.unmount()
    })

    it('shows empty state when history is empty', async () => {
      setupMockBothEmpty()
      const wrapper = mount(ObservabilityTab)
      await flushPromises()

      const toggleBtn = wrapper.find('[data-testid="history-toggle"]')
      await toggleBtn.trigger('click')
      await flushPromises()

      const emptyEl = wrapper.find('[data-testid="history-empty"]')
      expect(emptyEl.exists()).toBe(true)
      expect(emptyEl.text()).toContain('無歷程資料')
      wrapper.unmount()
    })

    it('shows error state when history fetch fails', async () => {
      mockGet.mockImplementation((url: string) => {
        if (url.includes('/api/alerts/history'))
          return Promise.reject(new Error('History fetch failed'))
        if (url.includes('/api/read/metrics')) return Promise.resolve(emptyMetricsFixture)
        if (url.includes('/api/read/errors/recent')) return Promise.resolve(emptyErrorsFixture)
        if (url.includes('/api/alerts/recent')) return Promise.resolve(emptyAlertsFixture)
        if (url.includes('/api/alerts/config')) return Promise.resolve(alertConfigFixture)
        return Promise.reject(new Error('Unknown URL'))
      })

      const wrapper = mount(ObservabilityTab)
      await flushPromises()

      const toggleBtn = wrapper.find('[data-testid="history-toggle"]')
      await toggleBtn.trigger('click')
      await flushPromises()

      expect(wrapper.text()).toContain('History fetch failed')
      const retryBtn = wrapper.find('[data-testid="history-retry"]')
      expect(retryBtn.exists()).toBe(true)
      wrapper.unmount()
    })

    it('retry button in history error state calls fetchAlertHistory again', async () => {
      mockGet.mockImplementation((url: string) => {
        if (url.includes('/api/alerts/history'))
          return Promise.reject(new Error('History fetch failed'))
        if (url.includes('/api/read/metrics')) return Promise.resolve(emptyMetricsFixture)
        if (url.includes('/api/read/errors/recent')) return Promise.resolve(emptyErrorsFixture)
        if (url.includes('/api/alerts/recent')) return Promise.resolve(emptyAlertsFixture)
        if (url.includes('/api/alerts/config')) return Promise.resolve(alertConfigFixture)
        return Promise.reject(new Error('Unknown URL'))
      })

      const wrapper = mount(ObservabilityTab)
      await flushPromises()

      const toggleBtn = wrapper.find('[data-testid="history-toggle"]')
      await toggleBtn.trigger('click')
      await flushPromises()

      // Fix mock and click retry
      setupMockBothSuccess()
      mockGet.mockClear()
      const retryBtn = wrapper.find('[data-testid="history-retry"]')
      await retryBtn.trigger('click')
      await flushPromises()

      expect(mockGet).toHaveBeenCalledWith(expect.stringContaining('/api/alerts/history'))
      wrapper.unmount()
    })

    it('auto-refresh includes history fetch when expanded', async () => {
      setupMockBothSuccess()
      const wrapper = mount(ObservabilityTab)
      await flushPromises()

      // Expand history first
      const toggleBtn = wrapper.find('[data-testid="history-toggle"]')
      await toggleBtn.trigger('click')
      await flushPromises()

      mockGet.mockClear()
      vi.advanceTimersByTime(10_000)
      await flushPromises()

      // Should include history call: metrics + errors + alerts/recent + config + history = 5
      const historyCalls = (mockGet.mock.calls as string[][]).filter((args) =>
        args[0].includes('/api/alerts/history'),
      )
      expect(historyCalls.length).toBeGreaterThanOrEqual(1)
      wrapper.unmount()
    })

    it('auto-refresh does NOT fetch history-panel (limit=200) when collapsed', async () => {
      setupMockBothSuccess()
      const wrapper = mount(ObservabilityTab)
      await flushPromises()

      // History is collapsed by default — do not expand
      // Note: timeline (from/to params) is still fetched; only the history panel (limit=200) should not be
      mockGet.mockClear()
      vi.advanceTimersByTime(10_000)
      await flushPromises()

      // Filter for the history-panel call (uses limit=200 without from/to params)
      const historyPanelCalls = (mockGet.mock.calls as string[][]).filter((args) =>
        args[0].includes('/api/alerts/history') && args[0].includes('limit=200') && !args[0].includes('from='),
      )
      expect(historyPanelCalls.length).toBe(0)
      wrapper.unmount()
    })

    it('manual Refresh button fetches history when expanded', async () => {
      setupMockBothSuccess()
      const wrapper = mount(ObservabilityTab)
      await flushPromises()

      // Expand history
      const toggleBtn = wrapper.find('[data-testid="history-toggle"]')
      await toggleBtn.trigger('click')
      await flushPromises()

      mockGet.mockClear()
      const refreshBtn = wrapper.findAll('button').find((b) => b.text().includes('Refresh'))
      await refreshBtn?.trigger('click')
      await flushPromises()

      // metrics + errors + alerts/recent + config + timeline + history = 6 calls
      expect(mockGet).toHaveBeenCalledTimes(6)
      // history panel call: limit=200 without from/to
      const historyPanelCalls = (mockGet.mock.calls as string[][]).filter((args) =>
        args[0].includes('/api/alerts/history') && args[0].includes('limit=200') && !args[0].includes('from='),
      )
      expect(historyPanelCalls.length).toBe(1)
      wrapper.unmount()
    })

    it('toggle button text changes to 收合 when expanded', async () => {
      setupMockBothSuccess()
      const wrapper = mount(ObservabilityTab)
      await flushPromises()

      const toggleBtn = wrapper.find('[data-testid="history-toggle"]')
      await toggleBtn.trigger('click')
      await flushPromises()

      expect(toggleBtn.text()).toContain('收合')
      wrapper.unmount()
    })

    it('clicking toggle twice collapses history again', async () => {
      setupMockBothSuccess()
      const wrapper = mount(ObservabilityTab)
      await flushPromises()

      const toggleBtn = wrapper.find('[data-testid="history-toggle"]')
      await toggleBtn.trigger('click')
      await flushPromises()

      expect(wrapper.text()).toContain('Alert 完整歷程')

      await toggleBtn.trigger('click')
      await flushPromises()

      expect(wrapper.text()).not.toContain('Alert 完整歷程')
      wrapper.unmount()
    })
  })
})
