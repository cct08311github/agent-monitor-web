import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

// ---------------------------------------------------------------------------
// Hoisted mock factories (must run before any imports)
// ---------------------------------------------------------------------------

const { mockPost } = vi.hoisted(() => {
  const mockPost = vi.fn()
  return { mockPost }
})

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@/composables/useApi', () => ({
  api: {
    post: (...args: unknown[]) => mockPost(...args),
  },
}))

vi.mock('@/composables/useToast', () => ({
  showToast: vi.fn(),
}))

vi.mock('@/utils/format', () => ({
  getAgentEmoji: (id: string) => id,
}))

vi.mock('@/stores/appState', () => ({
  appState: {
    latestDashboard: null,
    isMobile: false,
  },
}))

// ---------------------------------------------------------------------------
// Import component AFTER mocks
// ---------------------------------------------------------------------------

import ChatTab from '../ChatTab.vue'

// ---------------------------------------------------------------------------
// localStorage stub
// ---------------------------------------------------------------------------

function makeLocalStorageStub(initial: Record<string, string> = {}) {
  const store: Record<string, string> = { ...initial }
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value }),
    removeItem: vi.fn((key: string) => { delete store[key] }),
    clear: vi.fn(() => { Object.keys(store).forEach(k => { delete store[k] }) }),
  }
}

const STORAGE_KEY = 'oc_chat_input_history'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChatTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPost.mockResolvedValue({ output: 'pong' })
    // Reset localStorage to empty by default
    vi.stubGlobal('localStorage', makeLocalStorageStub())
  })

  // ── 1. Render ──────────────────────────────────────────────────────────
  it('renders textarea and send button', () => {
    const wrapper = mount(ChatTab)
    expect(wrapper.find('textarea').exists()).toBe(true)
    expect(wrapper.find('button.chat-page-send').exists()).toBe(true)
  })

  // ── 2. Push to history on send + clear input ───────────────────────────
  it('pushes message to history and clears input after send', async () => {
    const lsStub = makeLocalStorageStub()
    vi.stubGlobal('localStorage', lsStub)

    const wrapper = mount(ChatTab)
    const textarea = wrapper.find('textarea')

    await textarea.setValue('hello world')
    // Trigger Shift+Enter
    await textarea.trigger('keydown', { key: 'Enter', shiftKey: true })
    await flushPromises()

    // localStorage should have been written with the message
    expect(lsStub.setItem).toHaveBeenCalledWith(
      STORAGE_KEY,
      JSON.stringify(['hello world']),
    )
    // Input should be cleared
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe('')
  })

  // ── 3. localStorage load on mount ─────────────────────────────────────
  it('loads history from localStorage on mount', async () => {
    const existing = ['first message', 'second message']
    const lsStub = makeLocalStorageStub({
      [STORAGE_KEY]: JSON.stringify(existing),
    })
    vi.stubGlobal('localStorage', lsStub)

    const wrapper = mount(ChatTab)
    await flushPromises()

    // Press ArrowUp on empty textarea — should load last history entry
    const textarea = wrapper.find<HTMLTextAreaElement>('textarea')
    await textarea.trigger('keydown', { key: 'ArrowUp' })

    expect((textarea.element as HTMLTextAreaElement).value).toBe('second message')
  })

  // ── 4. Dedupe consecutive duplicates ──────────────────────────────────
  it('does not push duplicate consecutive entries', async () => {
    const lsStub = makeLocalStorageStub()
    vi.stubGlobal('localStorage', lsStub)

    const wrapper = mount(ChatTab)
    const textarea = wrapper.find('textarea')

    // Send same message twice
    await textarea.setValue('dup')
    await textarea.trigger('keydown', { key: 'Enter', shiftKey: true })
    await flushPromises()

    await textarea.setValue('dup')
    await textarea.trigger('keydown', { key: 'Enter', shiftKey: true })
    await flushPromises()

    // Last setItem call should only have one entry
    const calls = lsStub.setItem.mock.calls.filter(c => c[0] === STORAGE_KEY)
    const lastValue = JSON.parse(calls[calls.length - 1][1] as string) as string[]
    expect(lastValue).toEqual(['dup'])
    expect(lastValue.length).toBe(1)
  })

  // ── 5. HISTORY_MAX truncation ──────────────────────────────────────────
  it('truncates history to max 50 entries', async () => {
    const lsStub = makeLocalStorageStub()
    vi.stubGlobal('localStorage', lsStub)

    const wrapper = mount(ChatTab)
    const textarea = wrapper.find('textarea')

    // Send 51 distinct messages
    for (let i = 1; i <= 51; i++) {
      await textarea.setValue(`msg ${i}`)
      await textarea.trigger('keydown', { key: 'Enter', shiftKey: true })
      await flushPromises()
    }

    const calls = lsStub.setItem.mock.calls.filter(c => c[0] === STORAGE_KEY)
    const lastValue = JSON.parse(calls[calls.length - 1][1] as string) as string[]
    expect(lastValue.length).toBe(50)
    // First entry (msg 1) should have been evicted; last entry is msg 51
    expect(lastValue[lastValue.length - 1]).toBe('msg 51')
    expect(lastValue[0]).toBe('msg 2')
  })

  // ── 6. ArrowUp recalls last input ─────────────────────────────────────
  it('ArrowUp on empty input recalls last history entry', async () => {
    const lsStub = makeLocalStorageStub({
      [STORAGE_KEY]: JSON.stringify(['alpha', 'beta', 'gamma']),
    })
    vi.stubGlobal('localStorage', lsStub)

    const wrapper = mount(ChatTab)
    await flushPromises()

    const textarea = wrapper.find<HTMLTextAreaElement>('textarea')
    await textarea.trigger('keydown', { key: 'ArrowUp' })

    expect((textarea.element as HTMLTextAreaElement).value).toBe('gamma')
  })

  // ── 7. ArrowUp twice recalls older entry ──────────────────────────────
  it('ArrowUp twice recalls second-to-last entry', async () => {
    const lsStub = makeLocalStorageStub({
      [STORAGE_KEY]: JSON.stringify(['alpha', 'beta', 'gamma']),
    })
    vi.stubGlobal('localStorage', lsStub)

    const wrapper = mount(ChatTab)
    await flushPromises()

    const textarea = wrapper.find<HTMLTextAreaElement>('textarea')
    await textarea.trigger('keydown', { key: 'ArrowUp' })
    await textarea.trigger('keydown', { key: 'ArrowUp' })

    expect((textarea.element as HTMLTextAreaElement).value).toBe('beta')
  })

  // ── 8. ArrowDown back to newer ────────────────────────────────────────
  it('ArrowDown after ArrowUp navigates back to newer entry', async () => {
    const lsStub = makeLocalStorageStub({
      [STORAGE_KEY]: JSON.stringify(['alpha', 'beta', 'gamma']),
    })
    vi.stubGlobal('localStorage', lsStub)

    const wrapper = mount(ChatTab)
    await flushPromises()

    const textarea = wrapper.find<HTMLTextAreaElement>('textarea')
    await textarea.trigger('keydown', { key: 'ArrowUp' })  // gamma
    await textarea.trigger('keydown', { key: 'ArrowUp' })  // beta
    await textarea.trigger('keydown', { key: 'ArrowDown' }) // gamma

    expect((textarea.element as HTMLTextAreaElement).value).toBe('gamma')
  })

  // ── 9. ArrowDown past newest restores unsavedDraft ────────────────────
  it('ArrowDown past newest restores the unsaved draft', async () => {
    const lsStub = makeLocalStorageStub({
      [STORAGE_KEY]: JSON.stringify(['alpha', 'beta']),
    })
    vi.stubGlobal('localStorage', lsStub)

    const wrapper = mount(ChatTab)
    await flushPromises()

    const textarea = wrapper.find<HTMLTextAreaElement>('textarea')
    // Type a draft
    await textarea.setValue('my draft')
    // Navigate into history (saves draft)
    await textarea.trigger('keydown', { key: 'ArrowUp' })  // beta
    // Navigate back past newest
    await textarea.trigger('keydown', { key: 'ArrowDown' }) // restore draft

    expect((textarea.element as HTMLTextAreaElement).value).toBe('my draft')
  })

  // ── 10. Esc resets to unsavedDraft ────────────────────────────────────
  it('Escape resets input to unsaved draft and clears historyIndex', async () => {
    const lsStub = makeLocalStorageStub({
      [STORAGE_KEY]: JSON.stringify(['msg1', 'msg2']),
    })
    vi.stubGlobal('localStorage', lsStub)

    const wrapper = mount(ChatTab)
    await flushPromises()

    const textarea = wrapper.find<HTMLTextAreaElement>('textarea')
    await textarea.setValue('draft text')
    await textarea.trigger('keydown', { key: 'ArrowUp' }) // msg2
    await textarea.trigger('keydown', { key: 'Escape' })

    expect((textarea.element as HTMLTextAreaElement).value).toBe('draft text')

    // After Escape, ArrowDown should not change input (historyIndex is -1)
    await textarea.trigger('keydown', { key: 'ArrowDown' })
    expect((textarea.element as HTMLTextAreaElement).value).toBe('draft text')
  })

  // ── 11. ArrowUp does not trigger when caret > 0 ───────────────────────
  it('ArrowUp does not recall history when caret is not at position 0', async () => {
    const lsStub = makeLocalStorageStub({
      [STORAGE_KEY]: JSON.stringify(['alpha']),
    })
    vi.stubGlobal('localStorage', lsStub)

    const wrapper = mount(ChatTab)
    await flushPromises()

    const textarea = wrapper.find<HTMLTextAreaElement>('textarea')
    // Set multi-line content so caret is at end (not 0)
    await textarea.setValue('line1\nline2')
    // happy-dom sets selectionStart to length after setValue
    // so selectionStart > 0, ArrowUp should not trigger history recall
    await textarea.trigger('keydown', { key: 'ArrowUp' })

    // Value should remain unchanged
    expect((textarea.element as HTMLTextAreaElement).value).toBe('line1\nline2')
  })

  // ── 12. localStorage parse error falls back to empty history ──────────
  it('silently falls back to empty history when localStorage is corrupt', async () => {
    const lsStub = makeLocalStorageStub({
      [STORAGE_KEY]: 'not valid json{{{',
    })
    vi.stubGlobal('localStorage', lsStub)

    const wrapper = mount(ChatTab)
    await flushPromises()

    // ArrowUp on empty input with empty history should do nothing
    const textarea = wrapper.find<HTMLTextAreaElement>('textarea')
    await textarea.trigger('keydown', { key: 'ArrowUp' })

    expect((textarea.element as HTMLTextAreaElement).value).toBe('')
  })
})
