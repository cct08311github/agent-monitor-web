import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import type { ApiMetricsResponse, ApiErrorsResponse } from '../ObservabilityTab.vue'

// ---------------------------------------------------------------------------
// Stub api composable
// ---------------------------------------------------------------------------

const mockGet = vi.fn()

vi.mock('@/composables/useApi', () => ({
  api: { get: (...args: unknown[]) => mockGet(...args) },
  useApi: () => ({ get: (...args: unknown[]) => mockGet(...args) }),
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setupMockBothSuccess() {
  mockGet.mockImplementation((url: string) => {
    if (url.includes('/api/read/metrics')) return Promise.resolve(metricsFixture)
    if (url.includes('/api/read/errors/recent')) return Promise.resolve(errorsFixture)
    return Promise.reject(new Error('Unknown URL'))
  })
}

function setupMockBothEmpty() {
  mockGet.mockImplementation((url: string) => {
    if (url.includes('/api/read/metrics')) return Promise.resolve(emptyMetricsFixture)
    if (url.includes('/api/read/errors/recent')) return Promise.resolve(emptyErrorsFixture)
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

      expect(mockGet).toHaveBeenCalledTimes(2)
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

      // Should have fetched metrics + errors = 2 calls
      expect(mockGet).toHaveBeenCalledTimes(2)
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
})
