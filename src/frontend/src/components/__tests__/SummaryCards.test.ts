import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'

// ---------------------------------------------------------------------------
// Hoisted setup
// ---------------------------------------------------------------------------

const { mockAppState } = vi.hoisted(() => {
  const mockAppState = {
    currentExchangeRate: 32.0,
  }
  return { mockAppState }
})

vi.mock('@/stores/appState', () => ({
  appState: mockAppState,
}))

// ---------------------------------------------------------------------------
// Import component AFTER mocks
// ---------------------------------------------------------------------------

import SummaryCards from '../SummaryCards.vue'
import type { DashboardPayload } from '@/types/api'
import type { CostRange } from '@/composables/useDashboard'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeDashboard(overrides?: Partial<DashboardPayload>): DashboardPayload {
  return {
    agents: [
      { id: 'a1', status: 'active_executing' } as DashboardPayload['agents'][number],
      { id: 'a2', status: 'active_recent' } as DashboardPayload['agents'][number],
      { id: 'a3', status: 'dormant' } as DashboardPayload['agents'][number],
    ],
    cron: [
      { enabled: true } as DashboardPayload['cron'][number],
      { enabled: false } as DashboardPayload['cron'][number],
    ],
    sys: { cpu: 42.5 } as DashboardPayload['sys'],
    ...overrides,
  } as unknown as DashboardPayload
}

function mountCards(props?: Partial<{
  activeTab: string
  dashboard: DashboardPayload | null
  totalCost: number
  costRange: CostRange
}>) {
  return mount(SummaryCards, {
    props: {
      activeTab: 'monitor',
      dashboard: makeDashboard(),
      totalCost: 10,
      costRange: 'today' as CostRange,
      ...props,
    },
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SummaryCards', () => {
  // ── NumberTicker integration ───────────────────────────────────────────────

  it('renders NumberTicker components for count values', () => {
    const wrapper = mountCards()
    // NumberTicker renders .ticker-cell spans; there should be multiple
    const cells = wrapper.findAll('.ticker-cell')
    expect(cells.length).toBeGreaterThanOrEqual(3)
    wrapper.unmount()
  })

  it('displays active agent count via NumberTicker', () => {
    const wrapper = mountCards()
    // active_executing + active_recent = 2 active agents
    const summaryValues = wrapper.findAll('.summary-value')
    // First card shows active / total
    expect(summaryValues[0].text()).toContain('2')
    wrapper.unmount()
  })

  it('displays total agent count via NumberTicker', () => {
    const wrapper = mountCards()
    // 3 agents total
    expect(wrapper.findAll('.ticker-cell').some(c => c.text() === '3')).toBe(true)
    wrapper.unmount()
  })

  it('displays enabled cron count via NumberTicker', () => {
    const wrapper = mountCards()
    // 1 enabled cron job
    expect(wrapper.findAll('.ticker-cell').some(c => c.text() === '1')).toBe(true)
    wrapper.unmount()
  })

  // ── Cost display ───────────────────────────────────────────────────────────

  it('shows formatted cost string via NumberTicker', () => {
    const wrapper = mountCards({ totalCost: 10 })
    // 10 USD × 32 = NT$320
    expect(wrapper.find('.cost').text()).toContain('NT$320')
    wrapper.unmount()
  })

  // ── CPU ───────────────────────────────────────────────────────────────────

  it('shows CPU value from dashboard.sys.cpu', () => {
    const wrapper = mountCards()
    expect(wrapper.text()).toContain('43%')
    wrapper.unmount()
  })

  it('shows dash when sys.cpu is null', () => {
    const db = makeDashboard({ sys: null as unknown as DashboardPayload['sys'] })
    const wrapper = mountCards({ dashboard: db })
    expect(wrapper.text()).toContain('-')
    wrapper.unmount()
  })

  // ── Null dashboard ─────────────────────────────────────────────────────────

  it('renders safely when dashboard is null', () => {
    const wrapper = mountCards({ dashboard: null })
    // Should not throw; counts default to 0
    expect(wrapper.findAll('.ticker-cell').some(c => c.text() === '0')).toBe(true)
    wrapper.unmount()
  })
})
