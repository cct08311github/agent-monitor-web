import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'

// ---------------------------------------------------------------------------
// Stubs — declare BEFORE component import
// ---------------------------------------------------------------------------

const mockGet = vi.fn()

vi.mock('@/composables/useApi', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
  },
}))

const mockShowToast = vi.fn()

vi.mock('@/composables/useToast', () => ({
  showToast: (...args: unknown[]) => mockShowToast(...args),
  useToast: () => ({ showToast: (...args: unknown[]) => mockShowToast(...args) }),
}))

vi.mock('@/lib/focusTrap', () => ({
  createFocusTrap: () => ({
    activate: vi.fn(),
    deactivate: vi.fn(),
  }),
}))

// ---------------------------------------------------------------------------
// Import component AFTER mocks
// ---------------------------------------------------------------------------

import SessionViewer from '../SessionViewer.vue'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface SessionMessage {
  role: string
  text?: string
  toolUses?: string[]
}

function makeMessages(...overrides: Partial<SessionMessage>[]): SessionMessage[] {
  return overrides.map((o, i) => ({
    role: 'assistant',
    text: `message ${i + 1}`,
    ...o,
  }))
}

function mountViewer(props: { agentId?: string; sessionId?: string } = {}) {
  return mount(SessionViewer, {
    props: {
      agentId: props.agentId ?? 'agent-1',
      sessionId: props.sessionId ?? 'session-abc123',
    },
    attachTo: document.body,
  })
}

// ---------------------------------------------------------------------------
// 1. Loading state
// ---------------------------------------------------------------------------

describe('SessionViewer — loading state', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Never resolve to keep loading
    mockGet.mockReturnValue(new Promise(() => {}))
  })

  it('shows loading indicator while fetching', () => {
    const wrapper = mountViewer()
    expect(wrapper.text()).toContain('載入中')
    wrapper.unmount()
  })
})

// ---------------------------------------------------------------------------
// 2. Fetched messages rendering
// ---------------------------------------------------------------------------

describe('SessionViewer — fetched messages', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders fetched messages after load', async () => {
    const msgs = makeMessages({ role: 'user', text: 'Hello' }, { role: 'assistant', text: 'Hi there' })
    mockGet.mockResolvedValue({ success: true, messages: msgs })

    const wrapper = mountViewer()
    await flushPromises()
    await nextTick()

    expect(wrapper.text()).toContain('Hello')
    expect(wrapper.text()).toContain('Hi there')
    wrapper.unmount()
  })

  it('displays role labels in uppercase', async () => {
    const msgs = makeMessages({ role: 'user', text: 'test' })
    mockGet.mockResolvedValue({ success: true, messages: msgs })

    const wrapper = mountViewer()
    await flushPromises()
    await nextTick()

    expect(wrapper.text()).toContain('USER')
    wrapper.unmount()
  })

  it('renders tool uses when present', async () => {
    const msgs = makeMessages({ role: 'assistant', text: 'using tools', toolUses: ['bash', 'edit'] })
    mockGet.mockResolvedValue({ success: true, messages: msgs })

    const wrapper = mountViewer()
    await flushPromises()
    await nextTick()

    expect(wrapper.text()).toContain('bash')
    expect(wrapper.text()).toContain('edit')
    wrapper.unmount()
  })
})

// ---------------------------------------------------------------------------
// 3. Error state + retry
// ---------------------------------------------------------------------------

describe('SessionViewer — error state', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows error state on fetch failure', async () => {
    mockGet.mockRejectedValue(new Error('network error'))

    const wrapper = mountViewer()
    await flushPromises()
    await nextTick()

    expect(wrapper.text()).toContain('載入失敗')
    wrapper.unmount()
  })

  it('retry link triggers refetch', async () => {
    mockGet.mockRejectedValueOnce(new Error('fail'))
    mockGet.mockResolvedValueOnce({ success: true, messages: makeMessages({ role: 'user', text: 'retry ok' }) })

    const wrapper = mountViewer()
    await flushPromises()
    await nextTick()

    expect(wrapper.text()).toContain('載入失敗')

    await wrapper.find('a').trigger('click')
    await flushPromises()
    await nextTick()

    expect(wrapper.text()).toContain('retry ok')
    wrapper.unmount()
  })
})

// ---------------------------------------------------------------------------
// 4. Empty state
// ---------------------------------------------------------------------------

describe('SessionViewer — empty state', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows empty state when messages array is empty', async () => {
    mockGet.mockResolvedValue({ success: true, messages: [] })

    const wrapper = mountViewer()
    await flushPromises()
    await nextTick()

    expect(wrapper.text()).toContain('無訊息記錄')
    wrapper.unmount()
  })
})

// ---------------------------------------------------------------------------
// 5. Search filter
// ---------------------------------------------------------------------------

describe('SessionViewer — search filter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows all messages when search is empty', async () => {
    const msgs = makeMessages({ role: 'user', text: 'apple' }, { role: 'assistant', text: 'banana' })
    mockGet.mockResolvedValue({ success: true, messages: msgs })

    const wrapper = mountViewer()
    await flushPromises()
    await nextTick()

    expect(wrapper.text()).toContain('apple')
    expect(wrapper.text()).toContain('banana')
    wrapper.unmount()
  })

  it('filters messages by text content (case-insensitive)', async () => {
    const msgs = makeMessages({ role: 'user', text: 'Hello World' }, { role: 'assistant', text: 'goodbye' })
    mockGet.mockResolvedValue({ success: true, messages: msgs })

    const wrapper = mountViewer()
    await flushPromises()
    await nextTick()

    const input = wrapper.find('input[type="search"]')
    await input.setValue('hello')
    await nextTick()

    expect(wrapper.text()).toContain('Hello World')
    expect(wrapper.text()).not.toContain('goodbye')
    wrapper.unmount()
  })

  it('filters messages by role', async () => {
    const msgs = makeMessages({ role: 'user', text: 'from user' }, { role: 'assistant', text: 'from assistant' })
    mockGet.mockResolvedValue({ success: true, messages: msgs })

    const wrapper = mountViewer()
    await flushPromises()
    await nextTick()

    const input = wrapper.find('input[type="search"]')
    await input.setValue('user')
    await nextTick()

    // role 'user' matches via role filter, but role 'assistant' doesn't include 'user'
    expect(wrapper.text()).toContain('from user')
    wrapper.unmount()
  })

  it('filters messages by tool uses', async () => {
    const msgs = makeMessages(
      { role: 'assistant', text: 'no tools', toolUses: [] },
      { role: 'assistant', text: 'has bash tool', toolUses: ['bash'] },
    )
    mockGet.mockResolvedValue({ success: true, messages: msgs })

    const wrapper = mountViewer()
    await flushPromises()
    await nextTick()

    const input = wrapper.find('input[type="search"]')
    await input.setValue('bash')
    await nextTick()

    expect(wrapper.text()).toContain('has bash tool')
    // 'no tools' doesn't match 'bash'
    expect(wrapper.findAll('.sv-message').length).toBe(1)
    wrapper.unmount()
  })

  it('shows no-results message when no match', async () => {
    const msgs = makeMessages({ role: 'user', text: 'hello' })
    mockGet.mockResolvedValue({ success: true, messages: msgs })

    const wrapper = mountViewer()
    await flushPromises()
    await nextTick()

    const input = wrapper.find('input[type="search"]')
    await input.setValue('zzznomatch')
    await nextTick()

    expect(wrapper.find('.sv-no-results').exists()).toBe(true)
    wrapper.unmount()
  })

  it('shows count label with filtered vs total', async () => {
    const msgs = makeMessages({ role: 'user', text: 'apple' }, { role: 'assistant', text: 'banana' })
    mockGet.mockResolvedValue({ success: true, messages: msgs })

    const wrapper = mountViewer()
    await flushPromises()
    await nextTick()

    const input = wrapper.find('input[type="search"]')
    await input.setValue('apple')
    await nextTick()

    const count = wrapper.find('.sv-count')
    expect(count.exists()).toBe(true)
    expect(count.text()).toContain('1')
    expect(count.text()).toContain('2')
    wrapper.unmount()
  })
})

// ---------------------------------------------------------------------------
// 6. Copy button
// ---------------------------------------------------------------------------

describe('SessionViewer — copy button', () => {
  let writeTextMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    writeTextMock = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('copy button calls navigator.clipboard.writeText with message text', async () => {
    const msgs = makeMessages({ role: 'user', text: 'copy me' })
    mockGet.mockResolvedValue({ success: true, messages: msgs })

    const wrapper = mountViewer()
    await flushPromises()
    await nextTick()

    const copyBtn = wrapper.find('.sv-copy-btn')
    expect(copyBtn.exists()).toBe(true)
    await copyBtn.trigger('click')
    await flushPromises()

    expect(writeTextMock).toHaveBeenCalledWith('copy me')
    wrapper.unmount()
  })

  it('copy success calls showToast with success type', async () => {
    const msgs = makeMessages({ role: 'user', text: 'copy me' })
    mockGet.mockResolvedValue({ success: true, messages: msgs })

    const wrapper = mountViewer()
    await flushPromises()
    await nextTick()

    await wrapper.find('.sv-copy-btn').trigger('click')
    await flushPromises()

    expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('複製'), 'success')
    wrapper.unmount()
  })

  it('copy failure calls showToast with error type', async () => {
    writeTextMock.mockRejectedValue(new Error('clipboard denied'))
    const msgs = makeMessages({ role: 'user', text: 'copy me' })
    mockGet.mockResolvedValue({ success: true, messages: msgs })

    const wrapper = mountViewer()
    await flushPromises()
    await nextTick()

    await wrapper.find('.sv-copy-btn').trigger('click')
    await flushPromises()

    expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('失敗'), 'error')
    wrapper.unmount()
  })
})

// ---------------------------------------------------------------------------
// 7. Expand truncated message
// ---------------------------------------------------------------------------

describe('SessionViewer — expand truncated message', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not show expand button for short messages', async () => {
    const msgs = makeMessages({ role: 'assistant', text: 'short text' })
    mockGet.mockResolvedValue({ success: true, messages: msgs })

    const wrapper = mountViewer()
    await flushPromises()
    await nextTick()

    expect(wrapper.find('.sv-expand-btn').exists()).toBe(false)
    wrapper.unmount()
  })

  it('shows expand button for messages longer than 2000 chars', async () => {
    const longText = 'a'.repeat(2001)
    const msgs = makeMessages({ role: 'assistant', text: longText })
    mockGet.mockResolvedValue({ success: true, messages: msgs })

    const wrapper = mountViewer()
    await flushPromises()
    await nextTick()

    expect(wrapper.find('.sv-expand-btn').exists()).toBe(true)
    wrapper.unmount()
  })

  it('clicking expand button shows full text', async () => {
    const longText = 'start_' + 'x'.repeat(2000) + '_end'
    const msgs = makeMessages({ role: 'assistant', text: longText })
    mockGet.mockResolvedValue({ success: true, messages: msgs })

    const wrapper = mountViewer()
    await flushPromises()
    await nextTick()

    // Before expand — truncated, no '_end'
    expect(wrapper.text()).not.toContain('_end')

    await wrapper.find('.sv-expand-btn').trigger('click')
    await nextTick()

    // After expand — full text visible
    expect(wrapper.text()).toContain('_end')
    wrapper.unmount()
  })

  it('expand button disappears after clicking', async () => {
    const longText = 'a'.repeat(2001)
    const msgs = makeMessages({ role: 'assistant', text: longText })
    mockGet.mockResolvedValue({ success: true, messages: msgs })

    const wrapper = mountViewer()
    await flushPromises()
    await nextTick()

    expect(wrapper.find('.sv-expand-btn').exists()).toBe(true)

    await wrapper.find('.sv-expand-btn').trigger('click')
    await nextTick()

    expect(wrapper.find('.sv-expand-btn').exists()).toBe(false)
    wrapper.unmount()
  })
})
