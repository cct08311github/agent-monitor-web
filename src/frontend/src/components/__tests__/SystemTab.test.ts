import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

// ---------------------------------------------------------------------------
// Mocks — must be before component import
// ---------------------------------------------------------------------------

const mockGet = vi.fn()

vi.mock('@/composables/useApi', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
  },
}))

vi.mock('@/composables/useToast', () => ({
  showToast: vi.fn(),
}))

// appState with minimal shape — SystemTab reads latestDashboard.sys and agents
const mockAppState = {
  latestDashboard: null as {
    agents?: Array<{ id: string; costUSD: number; tokenUsage: number }>
    sys?: { cpu: number; memory: number; disk: number }
  } | null,
  currentExchangeRate: 32.0,
}

vi.mock('@/stores/appState', () => ({
  get appState() {
    return mockAppState
  },
}))

// Stub formatTokens / formatTWD
vi.mock('@/utils/format', () => ({
  formatTokens: (n: number) => `${n}tok`,
  formatTWD: (n: number) => `NT$${n}`,
}))

// Stub canvas — jsdom has no real 2D context; prevent errors
vi.stubGlobal('HTMLCanvasElement', class {
  getContext() { return null }
  getBoundingClientRect() { return { width: 0, height: 0 } }
  width = 0
  height = 0
})

// ResizeObserver stub
vi.stubGlobal('ResizeObserver', class {
  observe() {}
  disconnect() {}
})

// MutationObserver stub
vi.stubGlobal('MutationObserver', class {
  observe() {}
  disconnect() {}
})

// ---------------------------------------------------------------------------
// Import component AFTER mocks
// ---------------------------------------------------------------------------

import SystemTab from '../SystemTab.vue'

// ---------------------------------------------------------------------------
// Sample fixture helpers
// ---------------------------------------------------------------------------

function makeActivity(overrides?: Partial<{
  agent_id: string
  active_minutes: number
  last_seen: string
}>) {
  return {
    agent_id: 'agent-alpha',
    active_minutes: 30,
    last_seen: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 min ago
    ...overrides,
  }
}

function makeHistoryResponse(agentActivity: unknown[] = []) {
  return {
    success: true,
    history: [],
    costHistory: [],
    topSpenders: [],
    modelUsage: [],
    agentActivity,
  }
}

interface HealthFull {
  status: 'ok' | 'degraded' | 'critical'
  uptime_ms: number
  alerts_recent_count: number
  alerts_critical_count: number
  alerts_warning_count: number
  errors_recent_count: number
  p99_max_ms: number
  agents_active_count: number
  agents_total_count: number
  ts: number
}

function makeHealthFull(overrides?: Partial<HealthFull>): HealthFull {
  return {
    status: 'ok',
    uptime_ms: 60_000,
    alerts_recent_count: 0,
    alerts_critical_count: 0,
    alerts_warning_count: 0,
    errors_recent_count: 0,
    p99_max_ms: 45,
    agents_active_count: 2,
    agents_total_count: 5,
    ts: Date.now(),
    ...overrides,
  }
}

// mockGet discriminator: /health/full returns HealthFull, /history returns HistoryResponse
function makeDiscriminatedMock(healthData: HealthFull | null = makeHealthFull(), historyReject = false) {
  return (url: string) => {
    if ((url as string).includes('/health/full')) {
      if (healthData === null) return Promise.reject(new Error('network error'))
      return Promise.resolve(healthData)
    }
    if (historyReject) return Promise.reject(new Error('history error'))
    return Promise.resolve(makeHistoryResponse())
  }
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('SystemTab — Agent Activity Summary card', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // 1. Renders card with sample data
  it('renders Agent Activity card with sample data', async () => {
    mockGet.mockResolvedValue(
      makeHistoryResponse([
        makeActivity({ agent_id: 'agent-foo', active_minutes: 45 }),
        makeActivity({ agent_id: 'agent-bar', active_minutes: 10 }),
      ]),
    )
    const wrapper = mount(SystemTab)
    await flushPromises()

    const text = wrapper.text()
    expect(text).toContain('Agent 活躍度 (Top 10)')
    expect(text).toContain('agent-foo')
    expect(text).toContain('agent-bar')
    wrapper.unmount()
  })

  // 2. Top 10 limit — 12 entries, only 10 rendered
  it('limits display to top 10 agents when 12 entries provided', async () => {
    const activities = Array.from({ length: 12 }, (_, i) =>
      makeActivity({ agent_id: `agent-${i}`, active_minutes: i + 1 }),
    )
    mockGet.mockResolvedValue(makeHistoryResponse(activities))

    const wrapper = mount(SystemTab)
    await flushPromises()

    const rows = wrapper.findAll('.activity-row')
    expect(rows).toHaveLength(10)
    wrapper.unmount()
  })

  // 3. Sort by active_minutes descending
  it('sorts agents by active_minutes descending', async () => {
    mockGet.mockResolvedValue(
      makeHistoryResponse([
        makeActivity({ agent_id: 'low', active_minutes: 5 }),
        makeActivity({ agent_id: 'high', active_minutes: 120 }),
        makeActivity({ agent_id: 'mid', active_minutes: 60 }),
      ]),
    )
    const wrapper = mount(SystemTab)
    await flushPromises()

    const rows = wrapper.findAll('.activity-row')
    expect(rows[0].text()).toContain('high')
    expect(rows[1].text()).toContain('mid')
    expect(rows[2].text()).toContain('low')
    wrapper.unmount()
  })

  // 4. formatActiveMinutes — minutes < 60
  it('displays "30 分鐘" for 30 active_minutes', async () => {
    mockGet.mockResolvedValue(
      makeHistoryResponse([
        makeActivity({ agent_id: 'agent-x', active_minutes: 30 }),
      ]),
    )
    const wrapper = mount(SystemTab)
    await flushPromises()

    expect(wrapper.text()).toContain('30 分鐘')
    wrapper.unmount()
  })

  // 5. formatActiveMinutes — exactly 60 min → "1 小時 0 分"
  it('displays "1 小時 0 分" for exactly 60 active_minutes', async () => {
    mockGet.mockResolvedValue(
      makeHistoryResponse([
        makeActivity({ agent_id: 'agent-y', active_minutes: 60 }),
      ]),
    )
    const wrapper = mount(SystemTab)
    await flushPromises()

    expect(wrapper.text()).toContain('1 小時 0 分')
    wrapper.unmount()
  })

  // 6. formatActiveMinutes — 90 min → "1 小時 30 分"
  it('displays "1 小時 30 分" for 90 active_minutes', async () => {
    mockGet.mockResolvedValue(
      makeHistoryResponse([
        makeActivity({ agent_id: 'agent-z', active_minutes: 90 }),
      ]),
    )
    const wrapper = mount(SystemTab)
    await flushPromises()

    expect(wrapper.text()).toContain('1 小時 30 分')
    wrapper.unmount()
  })

  // 7. Empty state when agentActivity = []
  it('shows empty state when agentActivity is empty array', async () => {
    mockGet.mockResolvedValue(makeHistoryResponse([]))
    const wrapper = mount(SystemTab)
    await flushPromises()

    expect(wrapper.text()).toContain('目前無活躍記錄')
    expect(wrapper.find('.activity-table').exists()).toBe(false)
    wrapper.unmount()
  })

  // 8. Empty state when agentActivity is absent from response
  it('shows empty state when agentActivity is absent from response', async () => {
    mockGet.mockResolvedValue({
      success: true,
      history: [],
      costHistory: [],
      topSpenders: [],
      modelUsage: [],
      // no agentActivity key
    })
    const wrapper = mount(SystemTab)
    await flushPromises()

    expect(wrapper.text()).toContain('目前無活躍記錄')
    wrapper.unmount()
  })

  // 9. last_seen shows relative time
  it('displays relative time from last_seen via formatRelativeTime', async () => {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    mockGet.mockResolvedValue(
      makeHistoryResponse([
        makeActivity({ agent_id: 'agent-r', last_seen: tenMinutesAgo }),
      ]),
    )
    const wrapper = mount(SystemTab)
    await flushPromises()

    // 10 minutes ago → "10m ago"
    expect(wrapper.text()).toContain('10m ago')
    wrapper.unmount()
  })

  // 10. Table columns are present
  it('renders table header columns: Agent / 活躍時長 / 最後活動', async () => {
    mockGet.mockResolvedValue(
      makeHistoryResponse([
        makeActivity({ agent_id: 'agent-h', active_minutes: 20 }),
      ]),
    )
    const wrapper = mount(SystemTab)
    await flushPromises()

    const text = wrapper.text()
    expect(text).toContain('Agent')
    expect(text).toContain('活躍時長')
    expect(text).toContain('最後活動')
    wrapper.unmount()
  })
})

// ---------------------------------------------------------------------------
// SystemTab — 系統健康 Card (health/full composite status)
// ---------------------------------------------------------------------------

describe('SystemTab — 系統健康 Card', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // 1. Renders health card with status pill for status 'ok'
  it('renders health card with OK status pill', async () => {
    mockGet.mockImplementation(makeDiscriminatedMock(makeHealthFull({ status: 'ok' })))
    const wrapper = mount(SystemTab)
    await flushPromises()

    expect(wrapper.text()).toContain('系統健康')
    const pill = wrapper.find('.health-status-pill')
    expect(pill.exists()).toBe(true)
    expect(pill.classes()).toContain('health-status--ok')
    expect(pill.text()).toBe('OK')
    wrapper.unmount()
  })

  // 2. Status 'degraded' → amber class
  it('renders DEGRADED pill with amber class for degraded status', async () => {
    mockGet.mockImplementation(makeDiscriminatedMock(makeHealthFull({ status: 'degraded' })))
    const wrapper = mount(SystemTab)
    await flushPromises()

    const pill = wrapper.find('.health-status-pill')
    expect(pill.exists()).toBe(true)
    expect(pill.classes()).toContain('health-status--degraded')
    expect(pill.text()).toBe('DEGRADED')
    wrapper.unmount()
  })

  // 3. Status 'critical' → red class
  it('renders CRITICAL pill with red class for critical status', async () => {
    mockGet.mockImplementation(makeDiscriminatedMock(makeHealthFull({ status: 'critical' })))
    const wrapper = mount(SystemTab)
    await flushPromises()

    const pill = wrapper.find('.health-status-pill')
    expect(pill.exists()).toBe(true)
    expect(pill.classes()).toContain('health-status--critical')
    expect(pill.text()).toBe('CRITICAL')
    wrapper.unmount()
  })

  // 4. Loading state shown before fetch resolves
  it('shows loading state before health data resolves', async () => {
    let resolveHealth!: (value: HealthFull) => void
    const pending = new Promise<HealthFull>((res) => { resolveHealth = res })
    mockGet.mockImplementation((url: string) => {
      if ((url as string).includes('/health/full')) return pending
      return Promise.resolve(makeHistoryResponse())
    })
    const wrapper = mount(SystemTab)
    // Do NOT await flushPromises — data not yet resolved
    expect(wrapper.find('[data-testid="health-loading"]').exists()).toBe(true)
    // Now resolve to clean up
    resolveHealth(makeHealthFull())
    await flushPromises()
    wrapper.unmount()
  })

  // 5. Error state + retry button when fetch fails
  it('shows error state with retry button when health fetch fails', async () => {
    mockGet.mockImplementation(makeDiscriminatedMock(null))
    const wrapper = mount(SystemTab)
    await flushPromises()

    const errorEl = wrapper.find('[data-testid="health-error"]')
    expect(errorEl.exists()).toBe(true)
    expect(errorEl.text()).toContain('健康狀態載入失敗')
    const retryBtn = errorEl.find('button')
    expect(retryBtn.exists()).toBe(true)
    wrapper.unmount()
  })

  // 6. Metrics rows visible with correct values
  it('renders metric rows with correct values', async () => {
    mockGet.mockImplementation(makeDiscriminatedMock(makeHealthFull({
      agents_active_count: 3,
      agents_total_count: 7,
      alerts_recent_count: 4,
      alerts_critical_count: 1,
      alerts_warning_count: 3,
      errors_recent_count: 2,
      p99_max_ms: 120,
    })))
    const wrapper = mount(SystemTab)
    await flushPromises()

    const text = wrapper.text()
    expect(text).toContain('3 / 7')
    expect(text).toContain('120 ms')
    expect(wrapper.find('[data-testid="health-metrics"]').exists()).toBe(true)
    wrapper.unmount()
  })

  // 7. Auto-refresh: setInterval triggers fetchHealth after 15s
  it('auto-refresh interval triggers fetchHealth at 15s cadence', async () => {
    vi.useFakeTimers()
    mockGet.mockImplementation(makeDiscriminatedMock())
    const wrapper = mount(SystemTab)
    await flushPromises()

    const callsBefore = mockGet.mock.calls.filter((c: unknown[]) =>
      (c[0] as string).includes('/health/full'),
    ).length

    vi.advanceTimersByTime(15000)
    await flushPromises()

    const callsAfter = mockGet.mock.calls.filter((c: unknown[]) =>
      (c[0] as string).includes('/health/full'),
    ).length

    expect(callsAfter).toBeGreaterThan(callsBefore)
    wrapper.unmount()
    vi.useRealTimers()
  })

  // 8. onUnmounted clears the health interval
  it('clears health interval on unmount', async () => {
    vi.useFakeTimers()
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')
    mockGet.mockImplementation(makeDiscriminatedMock())
    const wrapper = mount(SystemTab)
    await flushPromises()

    wrapper.unmount()
    expect(clearIntervalSpy).toHaveBeenCalled()
    vi.useRealTimers()
  })

  // 9. Retry button calls fetchHealth again
  it('retry button re-fetches health data', async () => {
    // First call rejects, second call succeeds
    let callCount = 0
    mockGet.mockImplementation((url: string) => {
      if ((url as string).includes('/health/full')) {
        callCount++
        if (callCount === 1) return Promise.reject(new Error('fail'))
        return Promise.resolve(makeHealthFull({ status: 'ok' }))
      }
      return Promise.resolve(makeHistoryResponse())
    })

    const wrapper = mount(SystemTab)
    await flushPromises()

    // Should be in error state
    const errorEl = wrapper.find('[data-testid="health-error"]')
    expect(errorEl.exists()).toBe(true)

    // Click retry
    await errorEl.find('button').trigger('click')
    await flushPromises()

    // Now shows data
    expect(wrapper.find('[data-testid="health-metrics"]').exists()).toBe(true)
    wrapper.unmount()
  })

  // 10. Health and history calls are independent (history still works even if health fails)
  it('history data still loads when health fetch fails', async () => {
    mockGet.mockImplementation((url: string) => {
      if ((url as string).includes('/health/full')) return Promise.reject(new Error('fail'))
      return Promise.resolve(makeHistoryResponse([
        makeActivity({ agent_id: 'agent-independent', active_minutes: 10 }),
      ]))
    })
    const wrapper = mount(SystemTab)
    await flushPromises()

    expect(wrapper.find('[data-testid="health-error"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('agent-independent')
    wrapper.unmount()
  })
})

// ---------------------------------------------------------------------------
// SystemTab — Smart Insights card
// ---------------------------------------------------------------------------

interface InsightFixture {
  type: string
  severity: 'critical' | 'warning' | 'info'
  message: string
  ts: number
  meta?: Record<string, unknown>
}

function makeInsight(overrides?: Partial<InsightFixture>): InsightFixture {
  return {
    type: 'test_insight',
    severity: 'info',
    message: 'テスト observation',
    ts: Date.now(),
    ...overrides,
  }
}

// Helper: return a mock function that routes to the right endpoint
function makeInsightsMock(
  insightsResult: { insights: InsightFixture[] } | null = { insights: [] },
  insightsReject = false,
) {
  return (url: string) => {
    if ((url as string).includes('/insights')) {
      if (insightsReject) return Promise.reject(new Error('insights error'))
      if (insightsResult === null) return Promise.reject(new Error('null'))
      return Promise.resolve(insightsResult)
    }
    if ((url as string).includes('/health/full')) return Promise.resolve(makeHealthFull())
    return Promise.resolve(makeHistoryResponse())
  }
}

describe('SystemTab — Smart Insights card', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // 1. Empty state when no insights
  it('shows empty state when no insights returned', async () => {
    mockGet.mockImplementation(makeInsightsMock({ insights: [] }))
    const wrapper = mount(SystemTab)
    await flushPromises()

    const empty = wrapper.find('[data-testid="insights-empty"]')
    expect(empty.exists()).toBe(true)
    expect(empty.text()).toContain('一切正常')
    wrapper.unmount()
  })

  // 2. Renders insights list
  it('renders insights list when insights are returned', async () => {
    mockGet.mockImplementation(makeInsightsMock({
      insights: [
        makeInsight({ severity: 'critical', message: '告警風暴：1 小時內 15 條 alert' }),
        makeInsight({ severity: 'warning', message: 'Agent stale 已 36 小時未活動' }),
      ],
    }))
    const wrapper = mount(SystemTab)
    await flushPromises()

    const list = wrapper.find('[data-testid="insights-list"]')
    expect(list.exists()).toBe(true)
    const items = wrapper.findAll('.insight-item')
    expect(items).toHaveLength(2)
    expect(wrapper.text()).toContain('告警風暴')
    expect(wrapper.text()).toContain('stale')
    wrapper.unmount()
  })

  // 3. Severity icon mapping
  it('renders correct icons for each severity level', async () => {
    mockGet.mockImplementation(makeInsightsMock({
      insights: [
        makeInsight({ severity: 'critical', message: 'critical insight' }),
        makeInsight({ severity: 'warning', message: 'warning insight' }),
        makeInsight({ severity: 'info', message: 'info insight' }),
      ],
    }))
    const wrapper = mount(SystemTab)
    await flushPromises()

    const criticalItem = wrapper.find('[data-testid="insight-item-critical"]')
    const warningItem = wrapper.find('[data-testid="insight-item-warning"]')
    const infoItem = wrapper.find('[data-testid="insight-item-info"]')

    expect(criticalItem.exists()).toBe(true)
    expect(criticalItem.text()).toContain('🔴')

    expect(warningItem.exists()).toBe(true)
    expect(warningItem.text()).toContain('🟠')

    expect(infoItem.exists()).toBe(true)
    expect(infoItem.text()).toContain('🔵')

    wrapper.unmount()
  })

  // 4. Loading state shown before fetch resolves
  it('shows loading state before insights resolve', async () => {
    let resolveInsights!: (value: { insights: InsightFixture[] }) => void
    const pending = new Promise<{ insights: InsightFixture[] }>((res) => { resolveInsights = res })
    mockGet.mockImplementation((url: string) => {
      if ((url as string).includes('/insights')) return pending
      if ((url as string).includes('/health/full')) return Promise.resolve(makeHealthFull())
      return Promise.resolve(makeHistoryResponse())
    })
    const wrapper = mount(SystemTab)
    // Not awaiting flushPromises — data not yet resolved
    expect(wrapper.find('[data-testid="insights-loading"]').exists()).toBe(true)
    resolveInsights({ insights: [] })
    await flushPromises()
    wrapper.unmount()
  })

  // 5. Error state + retry when fetch fails
  it('shows error state with retry button when insights fetch fails', async () => {
    mockGet.mockImplementation(makeInsightsMock(null, true))
    const wrapper = mount(SystemTab)
    await flushPromises()

    const errorEl = wrapper.find('[data-testid="insights-error"]')
    expect(errorEl.exists()).toBe(true)
    expect(errorEl.text()).toContain('Insights 載入失敗')
    expect(errorEl.find('button').exists()).toBe(true)
    wrapper.unmount()
  })

  // 6. Retry button re-fetches and shows data
  it('retry button re-fetches and shows data on success', async () => {
    let callCount = 0
    mockGet.mockImplementation((url: string) => {
      if ((url as string).includes('/insights')) {
        callCount += 1
        if (callCount === 1) return Promise.reject(new Error('first fail'))
        return Promise.resolve({ insights: [makeInsight({ message: 'recovered' })] })
      }
      if ((url as string).includes('/health/full')) return Promise.resolve(makeHealthFull())
      return Promise.resolve(makeHistoryResponse())
    })
    const wrapper = mount(SystemTab)
    await flushPromises()

    // First call fails → error state
    const errorEl = wrapper.find('[data-testid="insights-error"]')
    expect(errorEl.exists()).toBe(true)

    // Click retry
    await errorEl.find('button').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="insights-list"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('recovered')
    wrapper.unmount()
  })

  // 7. Insight card is always rendered in the DOM
  it('renders insights-card container element', async () => {
    mockGet.mockImplementation(makeInsightsMock({ insights: [] }))
    const wrapper = mount(SystemTab)
    await flushPromises()

    expect(wrapper.find('[data-testid="insights-card"]').exists()).toBe(true)
    wrapper.unmount()
  })
})

// ---------------------------------------------------------------------------
// SystemTab — Cost Heatmap card
// ---------------------------------------------------------------------------

function makeHistoryWithCost(costHistory: Array<{ ts: string; total_cost: number }>) {
  return {
    success: true,
    history: [],
    costHistory,
    topSpenders: [],
    modelUsage: [],
    agentActivity: [],
  }
}

function recentIso(offsetDays: number, hour: number): string {
  const d = new Date()
  d.setDate(d.getDate() - offsetDays)
  d.setHours(hour, 0, 0, 0)
  return d.toISOString()
}

describe('SystemTab — Cost Heatmap card', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // 1. Heatmap card renders when cost data is present
  it('renders heatmap card section when cost data is present', async () => {
    mockGet.mockResolvedValue(
      makeHistoryWithCost([
        { ts: recentIso(0, 10), total_cost: 0.05 },
        { ts: recentIso(1, 14), total_cost: 0.10 },
      ]),
    )
    const wrapper = mount(SystemTab)
    await flushPromises()

    expect(wrapper.find('[data-testid="heatmap-card"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('成本熱力圖 (7×24h)')
    wrapper.unmount()
  })

  // 2. SVG contains exactly 168 rect cells (7 days × 24 hours)
  it('renders exactly 168 rect cells in the SVG', async () => {
    mockGet.mockResolvedValue(
      makeHistoryWithCost([
        { ts: recentIso(0, 8), total_cost: 0.01 },
      ]),
    )
    const wrapper = mount(SystemTab)
    await flushPromises()

    const svg = wrapper.find('[data-testid="heatmap-svg"]')
    expect(svg.exists()).toBe(true)
    const cells = wrapper.findAll('rect')
    expect(cells).toHaveLength(168)
    wrapper.unmount()
  })

  // 3. Empty state shown when costHistory is empty
  it('shows empty state when costHistory is empty', async () => {
    mockGet.mockResolvedValue(makeHistoryWithCost([]))
    const wrapper = mount(SystemTab)
    await flushPromises()

    const empty = wrapper.find('[data-testid="heatmap-empty"]')
    expect(empty.exists()).toBe(true)
    expect(empty.text()).toContain('無 cost 資料')
    // SVG should NOT render
    expect(wrapper.find('[data-testid="heatmap-svg"]').exists()).toBe(false)
    wrapper.unmount()
  })

  // 4. Tooltip title includes day label, hour, and cost value
  it('cell title tooltip contains day, hour, and cost', async () => {
    const ts = recentIso(0, 9)
    mockGet.mockResolvedValue(
      makeHistoryWithCost([{ ts, total_cost: 0.1234 }]),
    )
    const wrapper = mount(SystemTab)
    await flushPromises()

    const svg = wrapper.find('[data-testid="heatmap-svg"]')
    expect(svg.exists()).toBe(true)

    // Find any title element; at least one cell should have a populated cost
    const titles = wrapper.findAll('title')
    // At least one title must mention both an hour ":00" and "$"
    const matched = titles.find((t) => t.text().includes(':00') && t.text().includes('$'))
    expect(matched).toBeDefined()

    // The specific populated cell title must include 9:00 and the cost
    const populated = titles.find((t) => t.text().includes('9:00') && t.text().includes('0.1234'))
    expect(populated).toBeDefined()

    wrapper.unmount()
  })
})

// ---------------------------------------------------------------------------
// SystemTab — Cost Forecast card
// ---------------------------------------------------------------------------

function makeHistoryWithCostForecast(costHistory: Array<{ ts: string; total_cost: number }>) {
  return {
    success: true,
    history: [],
    costHistory,
    topSpenders: [],
    modelUsage: [],
    agentActivity: [],
  }
}

function recentIsoForecast(offsetDays: number, hour: number): string {
  const d = new Date()
  d.setDate(d.getDate() - offsetDays)
  d.setHours(hour, 0, 0, 0)
  return d.toISOString()
}

describe('SystemTab — Cost Forecast card', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // 1. Renders forecast card section header
  it('renders forecast section header', async () => {
    mockGet.mockResolvedValue(makeHistoryWithCostForecast([
      { ts: recentIsoForecast(1, 10), total_cost: 0.5 },
      { ts: recentIsoForecast(0, 10), total_cost: 0.6 },
    ]))
    const wrapper = mount(SystemTab)
    await flushPromises()

    expect(wrapper.find('[data-testid="forecast-section"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('成本預測')
    wrapper.unmount()
  })

  // 2. Empty state when costHistory has < 2 days (basis_days < 2)
  it('shows empty state when basis_days < 2', async () => {
    // Only one data point → aggregateDaily returns 1 day → basis_days=1 < 2
    mockGet.mockResolvedValue(makeHistoryWithCostForecast([
      { ts: recentIsoForecast(0, 10), total_cost: 1.0 },
    ]))
    const wrapper = mount(SystemTab)
    await flushPromises()

    const empty = wrapper.find('[data-testid="forecast-empty"]')
    expect(empty.exists()).toBe(true)
    expect(empty.text()).toContain('資料不足')
    expect(wrapper.find('[data-testid="forecast-content"]').exists()).toBe(false)
    wrapper.unmount()
  })

  // 3. Shows content when costHistory has >= 2 days
  it('renders forecast content with 7d and 30d rows when basis_days >= 2', async () => {
    const points = Array.from({ length: 5 }, (_, i) => ({
      ts: recentIsoForecast(4 - i, 10),
      total_cost: 0.5 + i * 0.1,
    }))
    mockGet.mockResolvedValue(makeHistoryWithCostForecast(points))
    const wrapper = mount(SystemTab)
    await flushPromises()

    expect(wrapper.find('[data-testid="forecast-content"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="forecast-7d"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="forecast-30d"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('下 7 天 預估')
    expect(wrapper.text()).toContain('下 30 天 預估')
    wrapper.unmount()
  })

  // 4. Confidence badge displays correct label for low confidence (basis_days < 7)
  it('shows low confidence badge when basis_days < 7', async () => {
    const points = Array.from({ length: 3 }, (_, i) => ({
      ts: recentIsoForecast(2 - i, 10),
      total_cost: 1.0,
    }))
    mockGet.mockResolvedValue(makeHistoryWithCostForecast(points))
    const wrapper = mount(SystemTab)
    await flushPromises()

    const badge = wrapper.find('[data-testid="forecast-confidence"]')
    expect(badge.exists()).toBe(true)
    expect(badge.classes()).toContain('forecast-confidence--low')
    expect(badge.text()).toContain('低')
    wrapper.unmount()
  })

  // 5. Confidence badge shows high confidence for perfect-fit data over 10+ days
  it('shows high confidence badge when rSquared > 0.5 and N >= 7', async () => {
    // Perfect ascending line over 10 days → rSquared=1
    const points = Array.from({ length: 10 }, (_, i) => ({
      ts: recentIsoForecast(9 - i, 10),
      total_cost: (i + 1) * 0.10,
    }))
    mockGet.mockResolvedValue(makeHistoryWithCostForecast(points))
    const wrapper = mount(SystemTab)
    await flushPromises()

    const badge = wrapper.find('[data-testid="forecast-confidence"]')
    expect(badge.exists()).toBe(true)
    expect(badge.classes()).toContain('forecast-confidence--high')
    expect(badge.text()).toContain('高')
    wrapper.unmount()
  })

  // 6. Trend arrow shows ↑ for increasing data
  it('shows upward trend indicator for increasing cost data', async () => {
    const points = Array.from({ length: 7 }, (_, i) => ({
      ts: recentIsoForecast(6 - i, 10),
      total_cost: (i + 1) * 0.50,
    }))
    mockGet.mockResolvedValue(makeHistoryWithCostForecast(points))
    const wrapper = mount(SystemTab)
    await flushPromises()

    const trend = wrapper.find('[data-testid="forecast-trend"]')
    expect(trend.exists()).toBe(true)
    expect(trend.text()).toContain('↑')
    wrapper.unmount()
  })

  // 7. Basis days text is shown
  it('displays basis_days text in the meta section', async () => {
    const points = Array.from({ length: 5 }, (_, i) => ({
      ts: recentIsoForecast(4 - i, 10),
      total_cost: 0.5,
    }))
    mockGet.mockResolvedValue(makeHistoryWithCostForecast(points))
    const wrapper = mount(SystemTab)
    await flushPromises()

    const basis = wrapper.find('[data-testid="forecast-basis"]')
    expect(basis.exists()).toBe(true)
    expect(basis.text()).toContain('天資料')
    wrapper.unmount()
  })
})

// ---------------------------------------------------------------------------
// SystemTab — Wall of Fame Card
// ---------------------------------------------------------------------------

describe('SystemTab — Wall of Fame Card', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAppState.latestDashboard = null
  })

  afterEach(() => {
    vi.restoreAllMocks()
    mockAppState.latestDashboard = null
  })

  // 1. Wall of Fame card renders in the DOM
  it('renders Wall of Fame card container', async () => {
    mockGet.mockResolvedValue(makeHistoryResponse([]))
    const wrapper = mount(SystemTab)
    await flushPromises()

    const card = wrapper.find('[data-testid="wof-card"]')
    expect(card.exists()).toBe(true)
    expect(wrapper.text()).toContain('Wall of Fame')
    wrapper.unmount()
  })

  // 2. Three leaderboard boards are rendered
  it('renders three leaderboard boards: cost, tokens, activity', async () => {
    mockGet.mockResolvedValue(makeHistoryResponse([]))
    const wrapper = mount(SystemTab)
    await flushPromises()

    expect(wrapper.find('[data-testid="wof-board-cost"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="wof-board-tokens"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="wof-board-activity"]').exists()).toBe(true)
    wrapper.unmount()
  })

  // 3. Empty state shown when no agents and no activity
  it('shows empty state for all three boards when no data', async () => {
    mockGet.mockResolvedValue(makeHistoryResponse([]))
    const wrapper = mount(SystemTab)
    await flushPromises()

    expect(wrapper.find('[data-testid="wof-empty-cost"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="wof-empty-tokens"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="wof-empty-activity"]').exists()).toBe(true)
    wrapper.unmount()
  })

  // 4. Cost leaderboard shows top agents from appState
  it('shows top cost agents from appState.latestDashboard.agents', async () => {
    mockAppState.latestDashboard = {
      agents: [
        { id: 'agent-alpha', costUSD: 1.5, tokenUsage: 100 },
        { id: 'agent-beta', costUSD: 0.5, tokenUsage: 50 },
      ],
    }
    mockGet.mockResolvedValue(makeHistoryResponse([]))
    const wrapper = mount(SystemTab)
    await flushPromises()

    const costBoard = wrapper.find('[data-testid="wof-board-cost"]')
    expect(costBoard.text()).toContain('agent-alpha')
    expect(costBoard.text()).toContain('agent-beta')
    // alpha should come before beta (higher cost)
    const text = costBoard.text()
    expect(text.indexOf('agent-alpha')).toBeLessThan(text.indexOf('agent-beta'))
    wrapper.unmount()
  })

  // 5. Token leaderboard shows top agents
  it('shows top token agents from appState.latestDashboard.agents', async () => {
    mockAppState.latestDashboard = {
      agents: [
        { id: 'token-king', costUSD: 0.1, tokenUsage: 50000 },
        { id: 'token-low', costUSD: 0.1, tokenUsage: 1000 },
      ],
    }
    mockGet.mockResolvedValue(makeHistoryResponse([]))
    const wrapper = mount(SystemTab)
    await flushPromises()

    const tokensBoard = wrapper.find('[data-testid="wof-board-tokens"]')
    expect(tokensBoard.text()).toContain('token-king')
    expect(tokensBoard.text()).toContain('token-low')
    const text = tokensBoard.text()
    expect(text.indexOf('token-king')).toBeLessThan(text.indexOf('token-low'))
    wrapper.unmount()
  })

  // 6. Activity leaderboard shows top activity agents
  it('shows top activity agents from agentActivityData', async () => {
    mockGet.mockResolvedValue(
      makeHistoryResponse([
        makeActivity({ agent_id: 'busy-agent', active_minutes: 120 }),
        makeActivity({ agent_id: 'lazy-agent', active_minutes: 10 }),
      ]),
    )
    const wrapper = mount(SystemTab)
    await flushPromises()

    const activityBoard = wrapper.find('[data-testid="wof-board-activity"]')
    expect(activityBoard.text()).toContain('busy-agent')
    expect(activityBoard.text()).toContain('lazy-agent')
    const text = activityBoard.text()
    expect(text.indexOf('busy-agent')).toBeLessThan(text.indexOf('lazy-agent'))
    wrapper.unmount()
  })

  // 7. Empty state shows 無資料 text
  it('shows "無資料" text in empty state boards', async () => {
    mockGet.mockResolvedValue(makeHistoryResponse([]))
    const wrapper = mount(SystemTab)
    await flushPromises()

    const wofText = wrapper.find('[data-testid="wof-card"]').text()
    // At least cost and tokens boards should show 無資料 (no appState agents)
    const count = (wofText.match(/無資料/g) ?? []).length
    expect(count).toBeGreaterThanOrEqual(2)
    wrapper.unmount()
  })
})

// ---------------------------------------------------------------------------
// Daily Digest Card
// ---------------------------------------------------------------------------

describe('SystemTab — Daily Digest card', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAppState.latestDashboard = null
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // 1. Render — card present and contains pre element
  it('renders Daily Digest card with pre element', async () => {
    mockGet.mockResolvedValue(makeHistoryResponse([]))
    const wrapper = mount(SystemTab)
    await flushPromises()

    const card = wrapper.find('[data-testid="digest-card"]')
    expect(card.exists()).toBe(true)
    expect(wrapper.text()).toContain('Daily Digest')

    const pre = wrapper.find('[data-testid="digest-pre"]')
    expect(pre.exists()).toBe(true)
    // pre content should be 5 lines
    const lines = pre.text().trim().split('\n')
    expect(lines).toHaveLength(5)
    wrapper.unmount()
  })

  // 2. Copy button — calls navigator.clipboard.writeText
  it('copy button calls clipboard.writeText with digest text', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', {
      clipboard: { writeText: writeTextMock },
    })
    mockGet.mockResolvedValue(makeHistoryResponse([]))

    const wrapper = mount(SystemTab)
    await flushPromises()

    const copyBtn = wrapper.find('[data-testid="digest-copy-btn"]')
    expect(copyBtn.exists()).toBe(true)
    await copyBtn.trigger('click')
    await flushPromises()

    expect(writeTextMock).toHaveBeenCalledOnce()
    const calledWith = writeTextMock.mock.calls[0][0] as string
    expect(calledWith).toContain('Daily Digest')
    wrapper.unmount()
  })

  // 3. Download button — triggers blob URL anchor click
  it('download button creates a Blob URL and triggers download', async () => {
    const clickMock = vi.fn()
    const revokeMock = vi.fn()
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn().mockReturnValue('blob:mock-url'),
      revokeObjectURL: revokeMock,
    })
    const fakeAnchor = {
      href: '',
      download: '',
      click: clickMock,
    }
    // Use vi.spyOn with a simple implementation that only intercepts 'a' tags
    const originalCreate = document.createElement.bind(document)
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a') return fakeAnchor as unknown as HTMLElement
      return originalCreate(tag)
    })

    mockGet.mockResolvedValue(makeHistoryResponse([]))
    const wrapper = mount(SystemTab)
    await flushPromises()

    const downloadBtn = wrapper.find('[data-testid="digest-download-btn"]')
    expect(downloadBtn.exists()).toBe(true)
    await downloadBtn.trigger('click')

    expect(clickMock).toHaveBeenCalledOnce()
    expect(fakeAnchor.download).toMatch(/^digest-\d{4}-\d{2}-\d{2}\.txt$/)
    expect(revokeMock).toHaveBeenCalledOnce()

    createElementSpy.mockRestore()
    wrapper.unmount()
  })
})
