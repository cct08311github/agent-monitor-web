import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'

// ---------------------------------------------------------------------------
// Mocks — hoisted before component import
// ---------------------------------------------------------------------------

vi.mock('@/stores/appState', () => ({
  appState: { currentExchangeRate: 32 },
}))

vi.mock('@/components/AgentQuickDiagnose.vue', () => ({
  default: {
    name: 'AgentQuickDiagnose',
    template: '<div class="stub-diagnose"></div>',
    props: ['agent', 'cost'],
    emits: ['close', 'detail'],
  },
}))

// ---------------------------------------------------------------------------
// Component import after mocks
// ---------------------------------------------------------------------------

import AgentCard from '../AgentCard.vue'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type PartialAgent = {
  id: string
  status: string
  model?: string
  tokenUsage?: number
  lastActivity?: string
  currentTask?: { task?: string; label?: string }
}

function makeAgent(overrides: Partial<PartialAgent> = {}): PartialAgent {
  return {
    id: 'test-agent',
    status: 'active_recent',
    model: 'claude-sonnet-4-6',
    tokenUsage: 1000,
    lastActivity: new Date(Date.now() - 30_000).toISOString(), // 30 s ago → 😊
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AgentCard — mood indicator', () => {
  it('renders mood emoji in .agent-mood element', () => {
    const wrapper = mount(AgentCard, {
      props: { agent: makeAgent() as never, cost: 0.5 },
    })
    const moodEl = wrapper.find('.agent-mood')
    expect(moodEl.exists()).toBe(true)
    // active_recent + recent lastActivity → 😊
    expect(moodEl.text()).toBe('😊')
  })

  it('tooltip (title) contains label and reason', () => {
    const wrapper = mount(AgentCard, {
      props: { agent: makeAgent() as never, cost: 0.5 },
    })
    const moodEl = wrapper.find('.agent-mood')
    const title = moodEl.attributes('title') ?? ''
    // expected: "正常 · 正常運作中"
    expect(title).toContain('正常')
    expect(title).toContain('正常運作中')
  })

  it('aria-label contains label and reason', () => {
    const wrapper = mount(AgentCard, {
      props: { agent: makeAgent() as never, cost: 0.5 },
    })
    const moodEl = wrapper.find('.agent-mood')
    const ariaLabel = moodEl.attributes('aria-label') ?? ''
    expect(ariaLabel).toContain('心情')
    expect(ariaLabel).toContain('正常')
  })

  it('shows 💀 when lastActivity is very old (no lastActivity)', () => {
    const wrapper = mount(AgentCard, {
      props: {
        agent: makeAgent({ lastActivity: undefined }) as never,
        cost: 0,
      },
    })
    const moodEl = wrapper.find('.agent-mood')
    expect(moodEl.text()).toBe('💀')
  })

  it('shows 🔥 when active and has currentTask', () => {
    const wrapper = mount(AgentCard, {
      props: {
        agent: makeAgent({
          status: 'active_executing',
          currentTask: { task: 'running tests', label: 'EXECUTING' },
        }) as never,
        cost: 0,
      },
    })
    const moodEl = wrapper.find('.agent-mood')
    expect(moodEl.text()).toBe('🔥')
    expect(moodEl.attributes('title')).toContain('工作中')
  })

  it('shows 😰 for error status', () => {
    const wrapper = mount(AgentCard, {
      props: {
        agent: makeAgent({
          status: 'error',
          lastActivity: new Date(Date.now() - 5_000).toISOString(),
        }) as never,
        cost: 0,
      },
    })
    expect(wrapper.find('.agent-mood').text()).toBe('😰')
  })
})
