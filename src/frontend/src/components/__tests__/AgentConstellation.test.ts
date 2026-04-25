import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'

// ---------------------------------------------------------------------------
// Mocks — must be hoisted before component import
// ---------------------------------------------------------------------------

vi.mock('@/utils/format', () => ({
  getAgentEmoji: (id: string) => (id.includes('code') ? '💻' : '🤖'),
}))

// ---------------------------------------------------------------------------
// Component import after mocks
// ---------------------------------------------------------------------------

import AgentConstellation from '../AgentConstellation.vue'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type AgentProp = { id: string; model?: string; status?: string }
type SubagentProp = {
  ownerAgent?: string
  subagentId?: string
  label?: string
  status?: string
  tokens?: number
}

function makeAgents(ids: string[]): AgentProp[] {
  return ids.map((id) => ({ id, status: 'active_recent' }))
}

function makeSubagents(items: SubagentProp[]): SubagentProp[] {
  return items
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AgentConstellation — empty state', () => {
  it('renders empty state when no subagents provided', () => {
    const wrapper = mount(AgentConstellation, {
      props: { agents: [], subagents: [] },
    })
    expect(wrapper.find('.constellation-empty').exists()).toBe(true)
    expect(wrapper.text()).toContain('無 sub-agent 數據')
  })

  it('renders empty state when subagents have no ownerAgent', () => {
    const wrapper = mount(AgentConstellation, {
      props: {
        agents: makeAgents(['agentA']),
        subagents: makeSubagents([
          { subagentId: 'orphan', status: 'idle', tokens: 100 },
        ]),
      },
    })
    expect(wrapper.find('.constellation-empty').exists()).toBe(true)
  })
})

describe('AgentConstellation — renders groups', () => {
  it('renders SVG when subagents with ownerAgent are provided', () => {
    const wrapper = mount(AgentConstellation, {
      props: {
        agents: makeAgents(['agentA']),
        subagents: makeSubagents([
          { ownerAgent: 'agentA', subagentId: 'sub1', label: 'Sub One', status: 'running', tokens: 1000 },
        ]),
      },
    })
    expect(wrapper.find('svg').exists()).toBe(true)
    expect(wrapper.find('.constellation-empty').exists()).toBe(false)
  })

  it('renders one cluster group per owner', () => {
    const wrapper = mount(AgentConstellation, {
      props: {
        agents: makeAgents(['agentA', 'agentB']),
        subagents: makeSubagents([
          { ownerAgent: 'agentA', subagentId: 'sub1', status: 'idle', tokens: 0 },
          { ownerAgent: 'agentB', subagentId: 'sub2', status: 'idle', tokens: 0 },
        ]),
      },
    })
    const clusters = wrapper.findAll('.constellation-cluster')
    expect(clusters).toHaveLength(2)
  })

  it('renders subagent tooltips with label and tokens', () => {
    const wrapper = mount(AgentConstellation, {
      props: {
        agents: makeAgents(['agentA']),
        subagents: makeSubagents([
          { ownerAgent: 'agentA', subagentId: 'sub1', label: 'MyWorker', status: 'running', tokens: 5000 },
        ]),
      },
    })
    const titleEl = wrapper.find('title')
    expect(titleEl.exists()).toBe(true)
    expect(titleEl.text()).toContain('MyWorker')
    expect(titleEl.text()).toContain('5000')
  })
})

describe('AgentConstellation — drill-down emit', () => {
  it('emits drill-down event when subagent circle is clicked', async () => {
    const wrapper = mount(AgentConstellation, {
      props: {
        agents: makeAgents(['agentA']),
        subagents: makeSubagents([
          { ownerAgent: 'agentA', subagentId: 'sub1', label: 'Sub One', status: 'running', tokens: 1000 },
        ]),
      },
    })
    const subagentGroup = wrapper.find('.constellation-subagent')
    expect(subagentGroup.exists()).toBe(true)
    await subagentGroup.trigger('click')
    const emitted = wrapper.emitted('drill-down')
    expect(emitted).toBeTruthy()
    expect(emitted!).toHaveLength(1)
    const payload = emitted![0][0] as { id: string; label: string }
    expect(payload.id).toBe('sub1')
    expect(payload.label).toBe('Sub One')
  })

  it('emits drill-down with correct token count', async () => {
    const wrapper = mount(AgentConstellation, {
      props: {
        agents: makeAgents(['agentA']),
        subagents: makeSubagents([
          { ownerAgent: 'agentA', subagentId: 'sub2', label: 'Worker', status: 'idle', tokens: 9999 },
        ]),
      },
    })
    const subagentGroup = wrapper.find('.constellation-subagent')
    await subagentGroup.trigger('click')
    const payload = wrapper.emitted('drill-down')![0][0] as { tokens: number }
    expect(payload.tokens).toBe(9999)
  })
})
