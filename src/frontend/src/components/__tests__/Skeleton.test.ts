import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import Skeleton from '../Skeleton.vue'

describe('Skeleton', () => {
  // ── Default render ─────────────────────────────────────────────────────────

  it('renders 1 row by default', () => {
    const wrapper = mount(Skeleton)
    const rows = wrapper.findAll('.skeleton-row')
    expect(rows).toHaveLength(1)
    wrapper.unmount()
  })

  it('has role="status" and aria-label="loading"', () => {
    const wrapper = mount(Skeleton)
    const root = wrapper.find('.skeleton-wrapper')
    expect(root.attributes('role')).toBe('status')
    expect(root.attributes('aria-label')).toBe('loading')
    wrapper.unmount()
  })

  // ── rows prop ──────────────────────────────────────────────────────────────

  it('renders correct number of rows from prop', () => {
    const wrapper = mount(Skeleton, { props: { rows: 4 } })
    expect(wrapper.findAll('.skeleton-row')).toHaveLength(4)
    wrapper.unmount()
  })

  it('clamps rows to at least 1 when 0 is passed', () => {
    const wrapper = mount(Skeleton, { props: { rows: 0 } })
    expect(wrapper.findAll('.skeleton-row')).toHaveLength(1)
    wrapper.unmount()
  })

  // ── width / height CSS vars ────────────────────────────────────────────────

  it('applies width and height as CSS custom properties', () => {
    const wrapper = mount(Skeleton, { props: { width: '60%', height: '24px' } })
    const style = wrapper.find('.skeleton-wrapper').attributes('style') ?? ''
    expect(style).toContain('--skeleton-width: 60%')
    expect(style).toContain('--skeleton-height: 24px')
    wrapper.unmount()
  })

  it('uses default width 100% and height 14px when props are omitted', () => {
    const wrapper = mount(Skeleton)
    const style = wrapper.find('.skeleton-wrapper').attributes('style') ?? ''
    expect(style).toContain('--skeleton-width: 100%')
    expect(style).toContain('--skeleton-height: 14px')
    wrapper.unmount()
  })

  // ── rounded prop ──────────────────────────────────────────────────────────

  it('sets border-radius var to 4px when rounded is true (default)', () => {
    const wrapper = mount(Skeleton)
    const style = wrapper.find('.skeleton-wrapper').attributes('style') ?? ''
    expect(style).toContain('--skeleton-radius: 4px')
    wrapper.unmount()
  })

  it('sets border-radius var to 0 when rounded is false', () => {
    const wrapper = mount(Skeleton, { props: { rounded: false } })
    const style = wrapper.find('.skeleton-wrapper').attributes('style') ?? ''
    expect(style).toContain('--skeleton-radius: 0')
    wrapper.unmount()
  })
})
