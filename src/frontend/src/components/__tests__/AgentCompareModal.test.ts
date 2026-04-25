import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import type { CompareAgentLike } from '@/utils/agentCompare'

// ---------------------------------------------------------------------------
// Mocks — hoisted before component import
// ---------------------------------------------------------------------------

vi.mock('@/stores/appState', () => ({
  appState: { currentExchangeRate: 32 },
}))

vi.mock('@/lib/focusTrap', () => ({
  createFocusTrap: () => ({
    activate: vi.fn(),
    deactivate: vi.fn(),
  }),
}))

// ---------------------------------------------------------------------------
// Component import after mocks
// ---------------------------------------------------------------------------

import AgentCompareModal from '../AgentCompareModal.vue'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAgent(overrides: Partial<CompareAgentLike> = {}): CompareAgentLike {
  return {
    id: 'agent-alpha',
    model: 'claude-sonnet-4-6',
    status: 'active_recent',
    lastActivity: new Date(Date.now() - 30_000).toISOString(),
    costs: { month: 3.0, total: 15.0 },
    tokens: { total: 100_000, input: 60_000, output: 40_000 },
    ...overrides,
  }
}

function mountModal(agentA: CompareAgentLike, agentB: CompareAgentLike) {
  return mount(AgentCompareModal, {
    props: { agentA, agentB },
    attachTo: document.body,
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AgentCompareModal', () => {
  beforeEach(() => {
    document.body.replaceChildren()
  })

  it('renders with role=dialog and aria-modal=true', () => {
    const a = makeAgent({ id: 'alpha' })
    const b = makeAgent({ id: 'beta' })
    const wrapper = mountModal(a, b)
    const dialog = wrapper.find('[role="dialog"]')
    expect(dialog.exists()).toBe(true)
    expect(dialog.attributes('aria-modal')).toBe('true')
  })

  it('displays both agent IDs in header', () => {
    const a = makeAgent({ id: 'agent-alpha' })
    const b = makeAgent({ id: 'agent-beta' })
    const wrapper = mountModal(a, b)
    const text = wrapper.text()
    expect(text).toContain('agent-alpha')
    expect(text).toContain('agent-beta')
  })

  it('renders 8 comparison rows', () => {
    const a = makeAgent({ id: 'alpha' })
    const b = makeAgent({ id: 'beta' })
    const wrapper = mountModal(a, b)
    const rows = wrapper.findAll('.compare-row')
    expect(rows).toHaveLength(8)
  })

  it('shows trophy for winner rows', () => {
    // A has lower cost -> A should win on cost rows
    const a = makeAgent({ id: 'alpha', costs: { month: 1.0, total: 5.0 } })
    const b = makeAgent({ id: 'beta', costs: { month: 5.0, total: 20.0 } })
    const wrapper = mountModal(a, b)
    const trophies = wrapper.findAll('.compare-trophy')
    // At least 2 trophies for month + total cost
    expect(trophies.length).toBeGreaterThanOrEqual(2)
  })

  it('applies winner-a class when A wins', () => {
    const a = makeAgent({ id: 'alpha', costs: { month: 1.0 } })
    const b = makeAgent({ id: 'beta', costs: { month: 9.0 } })
    const wrapper = mountModal(a, b)
    const winnerARows = wrapper.findAll('.winner-a')
    expect(winnerARows.length).toBeGreaterThan(0)
  })

  it('applies winner-b class when B wins', () => {
    const a = makeAgent({ id: 'alpha', costs: { month: 9.0 } })
    const b = makeAgent({ id: 'beta', costs: { month: 1.0 } })
    const wrapper = mountModal(a, b)
    const winnerBRows = wrapper.findAll('.winner-b')
    expect(winnerBRows.length).toBeGreaterThan(0)
  })

  it('emits close when close button is clicked', async () => {
    const wrapper = mountModal(makeAgent({ id: 'a' }), makeAgent({ id: 'b' }))
    const closeBtn = wrapper.find('.modal-close')
    await closeBtn.trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()
    expect(wrapper.emitted('close')?.length).toBe(1)
  })

  it('emits close when footer Close button is clicked', async () => {
    const wrapper = mountModal(makeAgent({ id: 'a' }), makeAgent({ id: 'b' }))
    const footerBtn = wrapper.find('.compare-footer .ctrl-btn')
    await footerBtn.trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('emits close when overlay background is clicked', async () => {
    const wrapper = mountModal(makeAgent({ id: 'a' }), makeAgent({ id: 'b' }))
    const overlay = wrapper.find('.agent-compare-overlay')
    await overlay.trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('renders mood emoji for both agents', () => {
    const a = makeAgent({
      id: 'alpha',
      status: 'active_executing',
      currentTask: { task: 'running tests' },
    })
    const b = makeAgent({ id: 'beta', status: 'active_recent' })
    const wrapper = mountModal(a, b)
    const moodEmojis = wrapper.findAll('.compare-mood-emoji')
    expect(moodEmojis).toHaveLength(2)
    // A is executing with task -> emoji should be present
    expect(moodEmojis[0].text().length).toBeGreaterThan(0)
    // B is active_recent -> emoji should be present
    expect(moodEmojis[1].text().length).toBeGreaterThan(0)
  })
})
