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
vi.mock('@/stores/appState', () => ({
  appState: {
    latestDashboard: null,
    currentExchangeRate: 32.0,
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
