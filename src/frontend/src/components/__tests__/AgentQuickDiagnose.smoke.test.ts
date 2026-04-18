import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AgentQuickDiagnose from '../AgentQuickDiagnose.vue'

const baseAgent = {
  id: 'alpha',
  status: 'active_executing',
  model: 'claude-opus-4-7',
  tokenUsage: 12345,
  lastActivity: '2 min ago',
  currentTask: { label: 'EXECUTING', task: 'Refactor auth module' },
  tokens: { total: 12345 },
}

describe('AgentQuickDiagnose (smoke)', () => {
  it('renders agent id, model, and status', () => {
    const wrapper = mount(AgentQuickDiagnose, {
      props: { agent: baseAgent as any, cost: 1.5 },
    })
    const text = wrapper.text()
    expect(text).toContain('alpha')
    expect(text).toContain('claude-opus-4-7')
    wrapper.unmount()
  })

  it('emits close when close button clicked', async () => {
    const wrapper = mount(AgentQuickDiagnose, {
      props: { agent: baseAgent as any, cost: 1.5 },
    })
    await wrapper.find('.aqd-close').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })

  it('emits detail and close when detail button clicked', async () => {
    const wrapper = mount(AgentQuickDiagnose, {
      props: { agent: baseAgent as any, cost: 1.5 },
    })
    await wrapper.find('.aqd-detail-btn').trigger('click')
    expect(wrapper.emitted('detail')).toHaveLength(1)
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })

  it('renders task preview when currentTask.task is non-empty', () => {
    const wrapper = mount(AgentQuickDiagnose, {
      props: { agent: baseAgent as any, cost: 1.5 },
    })
    expect(wrapper.text()).toContain('Refactor auth module')
    wrapper.unmount()
  })

  it('omits task section when no task', () => {
    const agentNoTask = { ...baseAgent, currentTask: { label: '', task: '' } }
    const wrapper = mount(AgentQuickDiagnose, {
      props: { agent: agentNoTask as any, cost: 0 },
    })
    expect(wrapper.find('.aqd-task').exists()).toBe(false)
    wrapper.unmount()
  })
})
