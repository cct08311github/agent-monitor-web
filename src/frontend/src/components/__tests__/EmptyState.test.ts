import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import EmptyState from '@/components/EmptyState.vue'

describe('EmptyState', () => {
  // ── Core rendering ──────────────────────────────────────────────────────────

  it('renders the title text', () => {
    const wrapper = mount(EmptyState, { props: { title: '沒有資料' } })
    expect(wrapper.find('h3').text()).toBe('沒有資料')
  })

  it('renders description when provided', () => {
    const wrapper = mount(EmptyState, {
      props: { title: 'T', description: '這裡是描述' },
    })
    expect(wrapper.find('p').text()).toBe('這裡是描述')
  })

  it('does NOT render description paragraph when description is undefined', () => {
    const wrapper = mount(EmptyState, { props: { title: 'T' } })
    expect(wrapper.find('p').exists()).toBe(false)
  })

  // ── Accessibility ────────────────────────────────────────────────────────────

  it('has role="status" on root element', () => {
    const wrapper = mount(EmptyState, { props: { title: 'T' } })
    expect(wrapper.attributes('role')).toBe('status')
  })

  it('has aria-live="polite" on root element', () => {
    const wrapper = mount(EmptyState, { props: { title: 'T' } })
    expect(wrapper.attributes('aria-live')).toBe('polite')
  })

  // ── data-variant attribute ───────────────────────────────────────────────────

  it('sets data-variant="generic" by default when variant not specified', () => {
    const wrapper = mount(EmptyState, { props: { title: 'T' } })
    expect(wrapper.attributes('data-variant')).toBe('generic')
  })

  it.each(['agents', 'logs', 'alerts', 'cron', 'tasks', 'generic'] as const)(
    'sets data-variant="%s" on root when variant is %s',
    (variant) => {
      const wrapper = mount(EmptyState, { props: { title: 'T', variant } })
      expect(wrapper.attributes('data-variant')).toBe(variant)
    },
  )

  // ── SVG illustration ─────────────────────────────────────────────────────────

  it.each(['agents', 'logs', 'alerts', 'cron', 'tasks', 'generic'] as const)(
    'renders an <svg> element for variant "%s"',
    (variant) => {
      const wrapper = mount(EmptyState, { props: { title: 'T', variant } })
      expect(wrapper.find('svg').exists()).toBe(true)
    },
  )

  // ── Action button ────────────────────────────────────────────────────────────

  it('does NOT render action button when only actionLabel is provided', () => {
    const wrapper = mount(EmptyState, {
      props: { title: 'T', actionLabel: '新增' },
    })
    expect(wrapper.find('button').exists()).toBe(false)
  })

  it('does NOT render action button when only onAction is provided', () => {
    const wrapper = mount(EmptyState, {
      props: { title: 'T', onAction: vi.fn() },
    })
    expect(wrapper.find('button').exists()).toBe(false)
  })

  it('renders action button when both actionLabel AND onAction are provided', () => {
    const wrapper = mount(EmptyState, {
      props: { title: 'T', actionLabel: '新增', onAction: vi.fn() },
    })
    const btn = wrapper.find('button')
    expect(btn.exists()).toBe(true)
    expect(btn.text()).toBe('新增')
  })

  it('calls onAction callback when action button is clicked', async () => {
    const onAction = vi.fn()
    const wrapper = mount(EmptyState, {
      props: { title: 'T', actionLabel: '新增', onAction },
    })
    await wrapper.find('button').trigger('click')
    expect(onAction).toHaveBeenCalledOnce()
  })
})
