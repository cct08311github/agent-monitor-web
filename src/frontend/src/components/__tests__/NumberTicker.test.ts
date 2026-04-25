import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import NumberTicker from '../NumberTicker.vue'

describe('NumberTicker', () => {
  // ── Rendering ──────────────────────────────────────────────────────────────

  it('renders a numeric value as a string', () => {
    const wrapper = mount(NumberTicker, { props: { value: 42 } })
    expect(wrapper.text()).toBe('42')
    wrapper.unmount()
  })

  it('renders a string value as-is', () => {
    const wrapper = mount(NumberTicker, { props: { value: 'NT$320' } })
    expect(wrapper.text()).toBe('NT$320')
    wrapper.unmount()
  })

  it('renders zero correctly', () => {
    const wrapper = mount(NumberTicker, { props: { value: 0 } })
    expect(wrapper.text()).toBe('0')
    wrapper.unmount()
  })

  // ── Key / re-render ────────────────────────────────────────────────────────

  it('re-renders the span with new key when value changes', async () => {
    const wrapper = mount(NumberTicker, { props: { value: 1 } })

    // Update the value
    await wrapper.setProps({ value: 2 })

    // Vue Transition mode="out-in" replaces the element; text should update
    expect(wrapper.text()).toBe('2')

    wrapper.unmount()
  })

  // ── Duration CSS variable ──────────────────────────────────────────────────

  it('sets --ticker-duration CSS variable from duration prop', () => {
    const wrapper = mount(NumberTicker, { props: { value: 7, duration: 400 } })
    const span = wrapper.find('.ticker-cell')
    // style attribute should contain the CSS variable
    const styleAttr = span.attributes('style') ?? ''
    expect(styleAttr).toContain('--ticker-duration: 400ms')
    wrapper.unmount()
  })

  it('uses default 250ms when duration prop is omitted', () => {
    const wrapper = mount(NumberTicker, { props: { value: 5 } })
    const span = wrapper.find('.ticker-cell')
    const styleAttr = span.attributes('style') ?? ''
    expect(styleAttr).toContain('--ticker-duration: 250ms')
    wrapper.unmount()
  })

  // ── Structure ──────────────────────────────────────────────────────────────

  it('renders a span with ticker-cell class', () => {
    const wrapper = mount(NumberTicker, { props: { value: 99 } })
    expect(wrapper.find('.ticker-cell').exists()).toBe(true)
    wrapper.unmount()
  })

  it('key equals String(value) so transitions fire on every distinct value', async () => {
    const wrapper = mount(NumberTicker, { props: { value: 10 } })
    await wrapper.setProps({ value: 10 })
    // Same value → same text, no transition needed
    expect(wrapper.text()).toBe('10')
    await wrapper.setProps({ value: 11 })
    expect(wrapper.text()).toBe('11')
    wrapper.unmount()
  })
})
