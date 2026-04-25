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

vi.mock('@/lib/focusTrap', () => ({
  createFocusTrap: () => ({
    activate: vi.fn(),
    deactivate: vi.fn(),
  }),
}))

// ---------------------------------------------------------------------------
// Import component AFTER mocks
// ---------------------------------------------------------------------------

import SessionReplay from '../SessionReplay.vue'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface SessionMessage {
  role: string
  text?: string
  toolUses?: string[]
  ts?: string | null
}

/** Build messages with ISO ts spaced 1 minute apart from baseMs */
function makeTimedMessages(
  count: number,
  baseMs = 1_700_000_000_000,
  stepMs = 60_000,
): SessionMessage[] {
  return Array.from({ length: count }, (_, i) => ({
    role: i % 2 === 0 ? 'assistant' : 'user',
    text: `message ${i + 1}`,
    ts: new Date(baseMs + i * stepMs).toISOString(),
  }))
}

function mountReplay(props: { agentId?: string; sessionId?: string } = {}) {
  return mount(SessionReplay, {
    props: {
      agentId: props.agentId ?? 'agent-1',
      sessionId: props.sessionId ?? 'session-abc123456789',
    },
    attachTo: document.body,
  })
}

// ---------------------------------------------------------------------------
// 1. Initial render — first message + scrubber visible
// ---------------------------------------------------------------------------

describe('SessionReplay — initial render', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders first message and scrubber after fetch', async () => {
    const msgs = makeTimedMessages(5)
    mockGet.mockResolvedValue({ success: true, messages: msgs })

    const wrapper = mountReplay()
    await flushPromises()
    await nextTick()

    expect(wrapper.text()).toContain('message 1')
    expect(wrapper.find('input[type="range"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('shows loading indicator while fetching', () => {
    mockGet.mockReturnValue(new Promise(() => {}))
    const wrapper = mountReplay()
    expect(wrapper.text()).toContain('載入中')
    wrapper.unmount()
  })

  it('shows error state on fetch failure', async () => {
    mockGet.mockRejectedValue(new Error('network error'))
    const wrapper = mountReplay()
    await flushPromises()
    await nextTick()
    expect(wrapper.text()).toContain('載入失敗')
    wrapper.unmount()
  })

  it('shows empty state when messages array is empty', async () => {
    mockGet.mockResolvedValue({ success: true, messages: [] })
    const wrapper = mountReplay()
    await flushPromises()
    await nextTick()
    expect(wrapper.text()).toContain('無訊息記錄')
    wrapper.unmount()
  })
})

// ---------------------------------------------------------------------------
// 2. Seek — scrub to last index renders all messages
// ---------------------------------------------------------------------------

describe('SessionReplay — seek', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('seek to last index renders all messages', async () => {
    const msgs = makeTimedMessages(4)
    mockGet.mockResolvedValue({ success: true, messages: msgs })

    const wrapper = mountReplay()
    await flushPromises()
    await nextTick()

    // Initially only first message visible
    expect(wrapper.findAll('.sr-message').length).toBe(1)

    // Seek to end
    const scrubber = wrapper.find('input[type="range"]')
    await scrubber.setValue('3')
    await scrubber.trigger('input')
    await nextTick()

    expect(wrapper.findAll('.sr-message').length).toBe(4)
    expect(wrapper.text()).toContain('message 4')
    wrapper.unmount()
  })

  it('seek to middle shows partial messages', async () => {
    const msgs = makeTimedMessages(5)
    mockGet.mockResolvedValue({ success: true, messages: msgs })

    const wrapper = mountReplay()
    await flushPromises()
    await nextTick()

    const scrubber = wrapper.find('input[type="range"]')
    await scrubber.setValue('2')
    await scrubber.trigger('input')
    await nextTick()

    expect(wrapper.findAll('.sr-message').length).toBe(3)
    wrapper.unmount()
  })
})

// ---------------------------------------------------------------------------
// 3. Delta hint — renders when gap >= 60s, hidden when < 60s
// ---------------------------------------------------------------------------

describe('SessionReplay — delta hints', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows delta hint when gap >= 60s', async () => {
    const base = 1_700_000_000_000
    const msgs: SessionMessage[] = [
      { role: 'assistant', text: 'msg 1', ts: new Date(base).toISOString() },
      { role: 'user', text: 'msg 2', ts: new Date(base + 90_000).toISOString() }, // 90s gap
    ]
    mockGet.mockResolvedValue({ success: true, messages: msgs })

    const wrapper = mountReplay()
    await flushPromises()
    await nextTick()

    // Seek to show both messages
    const scrubber = wrapper.find('input[type="range"]')
    await scrubber.setValue('1')
    await scrubber.trigger('input')
    await nextTick()

    expect(wrapper.find('.sr-delta-hint').exists()).toBe(true)
    expect(wrapper.find('.sr-delta-hint').text()).toContain('秒')
    wrapper.unmount()
  })

  it('does not show delta hint when gap < 60s', async () => {
    const base = 1_700_000_000_000
    const msgs: SessionMessage[] = [
      { role: 'assistant', text: 'msg 1', ts: new Date(base).toISOString() },
      { role: 'user', text: 'msg 2', ts: new Date(base + 30_000).toISOString() }, // 30s gap
    ]
    mockGet.mockResolvedValue({ success: true, messages: msgs })

    const wrapper = mountReplay()
    await flushPromises()
    await nextTick()

    const scrubber = wrapper.find('input[type="range"]')
    await scrubber.setValue('1')
    await scrubber.trigger('input')
    await nextTick()

    expect(wrapper.find('.sr-delta-hint').exists()).toBe(false)
    wrapper.unmount()
  })

  it('does not show delta hint for ts=null messages', async () => {
    const base = 1_700_000_000_000
    const msgs: SessionMessage[] = [
      { role: 'assistant', text: 'msg 1', ts: new Date(base).toISOString() },
      { role: 'user', text: 'msg 2', ts: null },
    ]
    mockGet.mockResolvedValue({ success: true, messages: msgs })

    const wrapper = mountReplay()
    await flushPromises()
    await nextTick()

    const scrubber = wrapper.find('input[type="range"]')
    await scrubber.setValue('1')
    await scrubber.trigger('input')
    await nextTick()

    expect(wrapper.find('.sr-delta-hint').exists()).toBe(false)
    wrapper.unmount()
  })
})

// ---------------------------------------------------------------------------
// 4. Play / Pause — cursorIndex advances on play, stops on pause
// ---------------------------------------------------------------------------

describe('SessionReplay — play / pause', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('play advances cursorIndex over time', async () => {
    // Messages with no ts → 0 delta → 50ms delay each
    const msgs: SessionMessage[] = Array.from({ length: 4 }, (_, i) => ({
      role: 'assistant',
      text: `msg ${i + 1}`,
      ts: null,
    }))
    mockGet.mockResolvedValue({ success: true, messages: msgs })

    const wrapper = mountReplay()
    await flushPromises()
    await nextTick()

    // Starts at index 0 showing 1 message
    expect(wrapper.findAll('.sr-message').length).toBe(1)

    const playBtn = wrapper.find('.sr-play-pause')
    await playBtn.trigger('click')
    await nextTick()

    // Advance timer enough for next message (50ms per step × 2 steps)
    vi.advanceTimersByTime(120)
    await nextTick()

    expect(wrapper.findAll('.sr-message').length).toBeGreaterThan(1)
    wrapper.unmount()
  })

  it('pause stops cursorIndex advancing', async () => {
    const msgs: SessionMessage[] = Array.from({ length: 5 }, (_, i) => ({
      role: 'assistant',
      text: `msg ${i + 1}`,
      ts: null,
    }))
    mockGet.mockResolvedValue({ success: true, messages: msgs })

    const wrapper = mountReplay()
    await flushPromises()
    await nextTick()

    const playBtn = wrapper.find('.sr-play-pause')
    await playBtn.trigger('click')
    await nextTick()

    // Advance a bit so cursor moves
    vi.advanceTimersByTime(60)
    await nextTick()

    // Pause
    await playBtn.trigger('click')
    await nextTick()

    const countAfterPause = wrapper.findAll('.sr-message').length

    // Advance more — cursor should not move further
    vi.advanceTimersByTime(500)
    await nextTick()

    expect(wrapper.findAll('.sr-message').length).toBe(countAfterPause)
    wrapper.unmount()
  })

  it('reaching end of messages auto-pauses', async () => {
    const msgs: SessionMessage[] = Array.from({ length: 3 }, (_, i) => ({
      role: 'assistant',
      text: `msg ${i + 1}`,
      ts: null,
    }))
    mockGet.mockResolvedValue({ success: true, messages: msgs })

    const wrapper = mountReplay()
    await flushPromises()
    await nextTick()

    const playBtn = wrapper.find('.sr-play-pause')
    await playBtn.trigger('click')
    await nextTick()

    // Advance past all messages (3 messages × 50ms = 150ms)
    vi.advanceTimersByTime(300)
    await nextTick()

    // All 3 messages should be visible
    expect(wrapper.findAll('.sr-message').length).toBe(3)

    // Should no longer be in playing state (button should show Play)
    expect(wrapper.find('.sr-play-pause').text()).toContain('播放')
    wrapper.unmount()
  })
})

// ---------------------------------------------------------------------------
// 5. Reset — returns to index 0
// ---------------------------------------------------------------------------

describe('SessionReplay — reset', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('reset returns cursorIndex to 0', async () => {
    const msgs = makeTimedMessages(5)
    mockGet.mockResolvedValue({ success: true, messages: msgs })

    const wrapper = mountReplay()
    await flushPromises()
    await nextTick()

    // Seek to end
    const scrubber = wrapper.find('input[type="range"]')
    await scrubber.setValue('4')
    await scrubber.trigger('input')
    await nextTick()

    expect(wrapper.findAll('.sr-message').length).toBe(5)

    // Reset
    await wrapper.find('.sr-reset').trigger('click')
    await nextTick()

    expect(wrapper.findAll('.sr-message').length).toBe(1)
    wrapper.unmount()
  })
})

// ---------------------------------------------------------------------------
// 6. Speed — affects advance delay
// ---------------------------------------------------------------------------

describe('SessionReplay — speed', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('4x speed advances faster than 1x speed', async () => {
    // Messages with real ts gaps (2000ms each)
    const base = 1_700_000_000_000
    const msgs: SessionMessage[] = Array.from({ length: 5 }, (_, i) => ({
      role: 'assistant',
      text: `msg ${i + 1}`,
      ts: new Date(base + i * 2000).toISOString(),
    }))
    mockGet.mockResolvedValue({ success: true, messages: msgs })

    const wrapper = mountReplay()
    await flushPromises()
    await nextTick()

    // Set to 4x speed
    const speedSelect = wrapper.find('.sr-speed-select')
    await speedSelect.setValue('4')
    await speedSelect.trigger('change')
    await nextTick()

    const playBtn = wrapper.find('.sr-play-pause')
    await playBtn.trigger('click')
    await nextTick()

    // At 4x speed, 2000ms gap / 4 = 500ms per step
    // After 600ms we should have advanced at least 1 step
    vi.advanceTimersByTime(600)
    await nextTick()

    expect(wrapper.findAll('.sr-message').length).toBeGreaterThan(1)
    wrapper.unmount()
  })
})

// ---------------------------------------------------------------------------
// 7. ts=null treated as 0 delta (no wait)
// ---------------------------------------------------------------------------

describe('SessionReplay — ts=null messages', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('messages with ts=null are treated as 0 delta and advance with minimal delay', async () => {
    const msgs: SessionMessage[] = [
      { role: 'assistant', text: 'first', ts: null },
      { role: 'user', text: 'second', ts: null },
      { role: 'assistant', text: 'third', ts: null },
    ]
    mockGet.mockResolvedValue({ success: true, messages: msgs })

    const wrapper = mountReplay()
    await flushPromises()
    await nextTick()

    const playBtn = wrapper.find('.sr-play-pause')
    await playBtn.trigger('click')
    await nextTick()

    // 50ms minimum delay per step — all 3 messages should appear within 200ms
    vi.advanceTimersByTime(200)
    await nextTick()

    expect(wrapper.findAll('.sr-message').length).toBe(3)
    wrapper.unmount()
  })
})

// ---------------------------------------------------------------------------
// 8. close emit
// ---------------------------------------------------------------------------

describe('SessionReplay — close', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('emits close when close button is clicked', async () => {
    mockGet.mockResolvedValue({ success: true, messages: makeTimedMessages(2) })

    const wrapper = mountReplay()
    await flushPromises()
    await nextTick()

    await wrapper.find('[aria-label="關閉 Replay"]').trigger('click')

    expect(wrapper.emitted('close')).toBeTruthy()
    wrapper.unmount()
  })
})
