import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import HeartbeatPulse from '../HeartbeatPulse.vue'

describe('HeartbeatPulse', () => {
  // ── Render with default props ──────────────────────────────────────────────

  it('renders with default props', () => {
    const wrapper = mount(HeartbeatPulse)
    expect(wrapper.find('.heartbeat-wrap').exists()).toBe(true)
    expect(wrapper.find('.heartbeat-icon').exists()).toBe(true)
    wrapper.unmount()
  })

  it('has role="status" on the wrapper span', () => {
    const wrapper = mount(HeartbeatPulse)
    expect(wrapper.find('.heartbeat-wrap').attributes('role')).toBe('status')
    wrapper.unmount()
  })

  // ── Tooltip contains active/total ──────────────────────────────────────────

  it('tooltip contains active count and total count', () => {
    const wrapper = mount(HeartbeatPulse, {
      props: { activeCount: 3, totalCount: 5, activeRatio: 0.6 },
    })
    const title = wrapper.find('.heartbeat-wrap').attributes('title') ?? ''
    expect(title).toContain('3')
    expect(title).toContain('5')
    wrapper.unmount()
  })

  it('aria-label matches tooltip text', () => {
    const wrapper = mount(HeartbeatPulse, {
      props: { activeCount: 2, totalCount: 4, activeRatio: 0.5 },
    })
    const wrap = wrapper.find('.heartbeat-wrap')
    expect(wrap.attributes('aria-label')).toBe(wrap.attributes('title'))
    wrapper.unmount()
  })

  it('tooltip shows 0/0 agents active with default props', () => {
    const wrapper = mount(HeartbeatPulse)
    expect(wrapper.find('.heartbeat-wrap').attributes('title')).toBe('0/0 agents active')
    wrapper.unmount()
  })

  // ── durationSec interpolation ──────────────────────────────────────────────

  it('animation duration is 3s when activeRatio=0', () => {
    const wrapper = mount(HeartbeatPulse, {
      props: { activeRatio: 0 },
    })
    const style = wrapper.find('.heartbeat-icon').attributes('style') ?? ''
    expect(style).toContain('animation-duration: 3s')
    wrapper.unmount()
  })

  it('animation duration is 0.6s when activeRatio=1', () => {
    const wrapper = mount(HeartbeatPulse, {
      props: { activeRatio: 1 },
    })
    const style = wrapper.find('.heartbeat-icon').attributes('style') ?? ''
    expect(style).toContain('animation-duration: 0.6s')
    wrapper.unmount()
  })

  it('animation duration is ~1.8s when activeRatio=0.5 (midpoint)', () => {
    const wrapper = mount(HeartbeatPulse, {
      props: { activeRatio: 0.5 },
    })
    const style = wrapper.find('.heartbeat-icon').attributes('style') ?? ''
    // 3 - 0.5 * 2.4 = 1.8
    expect(style).toContain('animation-duration: 1.8s')
    wrapper.unmount()
  })

  // ── Color at different ratio thresholds ────────────────────────────────────

  it('color is gray (#9aa0a6) when ratio < 0.2', () => {
    const wrapper = mount(HeartbeatPulse, {
      props: { activeRatio: 0.1 },
    })
    const style = wrapper.find('.heartbeat-icon').attributes('style') ?? ''
    expect(style).toContain('#9aa0a6')
    wrapper.unmount()
  })

  it('color is gray (#9aa0a6) when ratio = 0', () => {
    const wrapper = mount(HeartbeatPulse, {
      props: { activeRatio: 0 },
    })
    const style = wrapper.find('.heartbeat-icon').attributes('style') ?? ''
    expect(style).toContain('#9aa0a6')
    wrapper.unmount()
  })

  it('color is green (#22c55e) when ratio is between 0.2 and 0.7', () => {
    const wrapper = mount(HeartbeatPulse, {
      props: { activeRatio: 0.5 },
    })
    const style = wrapper.find('.heartbeat-icon').attributes('style') ?? ''
    expect(style).toContain('#22c55e')
    wrapper.unmount()
  })

  it('color is green (#22c55e) at exactly ratio = 0.2', () => {
    const wrapper = mount(HeartbeatPulse, {
      props: { activeRatio: 0.2 },
    })
    const style = wrapper.find('.heartbeat-icon').attributes('style') ?? ''
    expect(style).toContain('#22c55e')
    wrapper.unmount()
  })

  it('color is red (#ef4444) when ratio >= 0.7', () => {
    const wrapper = mount(HeartbeatPulse, {
      props: { activeRatio: 0.8 },
    })
    const style = wrapper.find('.heartbeat-icon').attributes('style') ?? ''
    expect(style).toContain('#ef4444')
    wrapper.unmount()
  })

  it('color is red (#ef4444) at exactly ratio = 0.7', () => {
    const wrapper = mount(HeartbeatPulse, {
      props: { activeRatio: 0.7 },
    })
    const style = wrapper.find('.heartbeat-icon').attributes('style') ?? ''
    expect(style).toContain('#ef4444')
    wrapper.unmount()
  })

  it('color is red (#ef4444) at ratio = 1', () => {
    const wrapper = mount(HeartbeatPulse, {
      props: { activeRatio: 1 },
    })
    const style = wrapper.find('.heartbeat-icon').attributes('style') ?? ''
    expect(style).toContain('#ef4444')
    wrapper.unmount()
  })

  // ── Clamping ───────────────────────────────────────────────────────────────

  it('clamps ratio < 0 to 0 — color is gray', () => {
    const wrapper = mount(HeartbeatPulse, {
      props: { activeRatio: -0.5 },
    })
    const style = wrapper.find('.heartbeat-icon').attributes('style') ?? ''
    expect(style).toContain('#9aa0a6')
    wrapper.unmount()
  })

  it('clamps ratio < 0 to 0 — duration is 3s', () => {
    const wrapper = mount(HeartbeatPulse, {
      props: { activeRatio: -1 },
    })
    const style = wrapper.find('.heartbeat-icon').attributes('style') ?? ''
    expect(style).toContain('animation-duration: 3s')
    wrapper.unmount()
  })

  it('clamps ratio > 1 to 1 — color is red', () => {
    const wrapper = mount(HeartbeatPulse, {
      props: { activeRatio: 1.5 },
    })
    const style = wrapper.find('.heartbeat-icon').attributes('style') ?? ''
    expect(style).toContain('#ef4444')
    wrapper.unmount()
  })

  it('clamps ratio > 1 to 1 — duration is 0.6s', () => {
    const wrapper = mount(HeartbeatPulse, {
      props: { activeRatio: 2 },
    })
    const style = wrapper.find('.heartbeat-icon').attributes('style') ?? ''
    expect(style).toContain('animation-duration: 0.6s')
    wrapper.unmount()
  })
})
