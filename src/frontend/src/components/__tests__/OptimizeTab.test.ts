import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

// ---------------------------------------------------------------------------
// Hoisted mock factories
// ---------------------------------------------------------------------------

const { mockGet, mockShowToast } = vi.hoisted(() => {
  const mockGet = vi.fn()
  const mockShowToast = vi.fn()
  return { mockGet, mockShowToast }
})

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@/composables/useApi', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
  },
  getBasePath: () => '',
}))

vi.mock('@/composables/useToast', () => ({
  showToast: (...args: unknown[]) => mockShowToast(...args),
}))

// ---------------------------------------------------------------------------
// Import component AFTER mocks
// ---------------------------------------------------------------------------

import OptimizeTab from '../OptimizeTab.vue'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const historyFixture = [
  { filename: '2026-04-25-auto-optimize.md', date: '2026-04-25', size_bytes: 2048 },
  { filename: '2026-04-20-auto-optimize.md', date: '2026-04-20', size_bytes: 1024 },
]

const planContentFixture = '# Auto-Optimize Report — 2026-04-25\n\n## 優化建議\n\nContent here.'

function mockHistorySuccess() {
  mockGet.mockResolvedValueOnce({ success: true, history: historyFixture })
}

function mockHistoryEmpty() {
  mockGet.mockResolvedValueOnce({ success: true, history: [] })
}

function mockHistoryError() {
  mockGet.mockRejectedValueOnce(new Error('network error'))
}

function mockPlanSuccess() {
  mockGet.mockResolvedValueOnce({
    success: true,
    filename: '2026-04-25-auto-optimize.md',
    content: planContentFixture,
  })
}

function mockPlanError() {
  mockGet.mockRejectedValueOnce(new Error('not found'))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OptimizeTab — history list', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders history entries on mount', async () => {
    mockHistorySuccess()
    const wrapper = mount(OptimizeTab)
    await flushPromises()

    const items = wrapper.findAll('.optimize-history-item')
    expect(items).toHaveLength(2)
    expect(items[0].text()).toContain('2026-04-25')
    expect(items[1].text()).toContain('2026-04-20')
  })

  it('shows empty state when no history', async () => {
    mockHistoryEmpty()
    const wrapper = mount(OptimizeTab)
    await flushPromises()

    expect(wrapper.text()).toContain('尚無過往報告')
    expect(wrapper.findAll('.optimize-history-item')).toHaveLength(0)
  })

  it('shows error message when history fetch fails', async () => {
    mockHistoryError()
    const wrapper = mount(OptimizeTab)
    await flushPromises()

    expect(wrapper.find('.optimize-history-error').exists()).toBe(true)
    expect(wrapper.find('.optimize-history-error').text()).toContain('無法載入')
  })

  it('shows formatted file size for each entry', async () => {
    mockHistorySuccess()
    const wrapper = mount(OptimizeTab)
    await flushPromises()

    // 2048 bytes = 2.0 KB
    const items = wrapper.findAll('.optimize-history-item')
    expect(items[0].find('.optimize-history-size').text()).toContain('KB')
  })
})

describe('OptimizeTab — plan viewer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('displays plan content when a history entry is clicked', async () => {
    mockHistorySuccess()
    const wrapper = mount(OptimizeTab)
    await flushPromises()

    mockPlanSuccess()
    const firstItem = wrapper.find('.optimize-history-item')
    await firstItem.trigger('click')
    await flushPromises()

    expect(wrapper.find('.optimize-viewer').exists()).toBe(true)
    expect(wrapper.find('.optimize-viewer-content').text()).toContain('Auto-Optimize Report')
  })

  it('shows error in viewer when result fetch fails', async () => {
    mockHistorySuccess()
    const wrapper = mount(OptimizeTab)
    await flushPromises()

    mockPlanError()
    const firstItem = wrapper.find('.optimize-history-item')
    await firstItem.trigger('click')
    await flushPromises()

    expect(wrapper.find('.optimize-viewer-error').exists()).toBe(true)
    expect(wrapper.find('.optimize-viewer-error').text()).toContain('無法載入')
  })

  it('closes the viewer when close button is clicked', async () => {
    mockHistorySuccess()
    const wrapper = mount(OptimizeTab)
    await flushPromises()

    mockPlanSuccess()
    await wrapper.find('.optimize-history-item').trigger('click')
    await flushPromises()

    expect(wrapper.find('.optimize-viewer').exists()).toBe(true)

    await wrapper.find('.optimize-viewer-close').trigger('click')
    expect(wrapper.find('.optimize-viewer').exists()).toBe(false)
  })

  it('highlights the active history entry', async () => {
    mockHistorySuccess()
    const wrapper = mount(OptimizeTab)
    await flushPromises()

    mockPlanSuccess()
    await wrapper.find('.optimize-history-item').trigger('click')
    await flushPromises()

    const firstItem = wrapper.findAll('.optimize-history-item')[0]
    expect(firstItem.classes()).toContain('active')
  })

  it('calls GET /api/optimize/result/:filename with the correct URL', async () => {
    mockHistorySuccess()
    const wrapper = mount(OptimizeTab)
    await flushPromises()

    mockPlanSuccess()
    await wrapper.find('.optimize-history-item').trigger('click')
    await flushPromises()

    // The second call should be for the plan result
    const calls = mockGet.mock.calls
    const resultCall = calls.find((c) => (c[0] as string).includes('/api/optimize/result/'))
    expect(resultCall).toBeTruthy()
    expect(resultCall![0]).toContain('2026-04-25-auto-optimize.md')
  })
})
