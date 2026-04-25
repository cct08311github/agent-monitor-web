import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'

// ---------------------------------------------------------------------------
// localStorage stub — set up at module level so both the component and
// the test share the same instance.
// ---------------------------------------------------------------------------

const _lsStore: Record<string, string> = {}

const localStorageMock = {
  getItem: vi.fn((key: string): string | null => _lsStore[key] ?? null),
  setItem: vi.fn((key: string, value: string): void => {
    _lsStore[key] = value
  }),
  removeItem: vi.fn((key: string): void => {
    delete _lsStore[key]
  }),
  clear: vi.fn((): void => {
    for (const key of Object.keys(_lsStore)) delete _lsStore[key]
  }),
  key: vi.fn((i: number): string | null => Object.keys(_lsStore)[i] ?? null),
  get length() {
    return Object.keys(_lsStore).length
  },
}

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
})

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockInfo = vi.fn()

vi.mock('@/composables/useToast', () => ({
  showToast: vi.fn(),
  useToast: () => ({
    info: (...args: unknown[]) => mockInfo(...args),
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    show: vi.fn(),
    dismiss: vi.fn(),
    clear: vi.fn(),
    queue: { value: [] },
  }),
}))

// ---------------------------------------------------------------------------
// Component import after mocks
// ---------------------------------------------------------------------------

import AgentNotes from '../AgentNotes.vue'
import { loadNote, saveNote } from '@/utils/agentNotes'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mountNotes(agentId = 'test-agent') {
  return mount(AgentNotes, {
    props: { agentId },
    attachTo: document.body,
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AgentNotes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorageMock.clear()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ── Mount with existing note ───────────────────────────────────────────────

  it('loads existing note on mount when agentId is given', async () => {
    const ts = 1_700_000_000_000
    saveNote('test-agent', 'pre-existing note text', ts)

    const wrapper = mountNotes('test-agent')
    await nextTick()

    const textarea = wrapper.find('textarea')
    expect(textarea.element.value).toBe('pre-existing note text')

    wrapper.unmount()
  })

  it('shows empty textarea when no note stored for agent', async () => {
    const wrapper = mountNotes('brand-new-agent')
    await nextTick()

    const textarea = wrapper.find('textarea')
    expect(textarea.element.value).toBe('')

    wrapper.unmount()
  })

  // ── Auto-save debounce ────────────────────────────────────────────────────

  it('typing text and waiting 800ms saves the note to localStorage', async () => {
    const wrapper = mountNotes('test-agent')
    await nextTick()

    const textarea = wrapper.find('textarea')
    await textarea.setValue('my new note')
    await nextTick()

    // Before debounce — not saved yet
    expect(loadNote('test-agent')).toBeNull()

    // Advance past debounce threshold
    await vi.advanceTimersByTimeAsync(800)
    await flushPromises()
    await nextTick()

    const saved = loadNote('test-agent')
    expect(saved).not.toBeNull()
    expect(saved?.text).toBe('my new note')

    wrapper.unmount()
  })

  it('rapid typing only saves once after final keystroke', async () => {
    const wrapper = mountNotes('test-agent')
    await nextTick()

    const textarea = wrapper.find('textarea')

    await textarea.setValue('partial')
    await vi.advanceTimersByTimeAsync(400)
    await nextTick()
    await textarea.setValue('partial final')
    await vi.advanceTimersByTimeAsync(800)
    await flushPromises()
    await nextTick()

    const saved = loadNote('test-agent')
    expect(saved?.text).toBe('partial final')

    wrapper.unmount()
  })

  // ── Clear ─────────────────────────────────────────────────────────────────

  it('clearing (after confirm) empties the textarea AND removes localStorage entry', async () => {
    saveNote('test-agent', 'some note to clear', Date.now())

    // Stub window.confirm to return true
    vi.stubGlobal('confirm', () => true)

    const wrapper = mountNotes('test-agent')
    await nextTick()

    // Verify text is loaded
    expect(wrapper.find('textarea').element.value).toBe('some note to clear')

    const clearBtn = wrapper.find('.agent-notes-clear-btn')
    expect(clearBtn.exists()).toBe(true)
    await clearBtn.trigger('click')
    await nextTick()

    // Textarea should be empty
    expect(wrapper.find('textarea').element.value).toBe('')

    // localStorage entry should be removed
    expect(loadNote('test-agent')).toBeNull()

    // Toast should be shown
    expect(mockInfo).toHaveBeenCalledWith('筆記已清除')

    wrapper.unmount()
  })

  it('does NOT clear when user cancels the confirm dialog', async () => {
    saveNote('test-agent', 'keep this note', Date.now())

    // Stub window.confirm to return false
    vi.stubGlobal('confirm', () => false)

    const wrapper = mountNotes('test-agent')
    await nextTick()

    const clearBtn = wrapper.find('.agent-notes-clear-btn')
    await clearBtn.trigger('click')
    await nextTick()

    // Text should remain
    expect(wrapper.find('textarea').element.value).toBe('keep this note')
    expect(loadNote('test-agent')).not.toBeNull()
    expect(mockInfo).not.toHaveBeenCalled()

    wrapper.unmount()
  })

  // ── agentId switching ─────────────────────────────────────────────────────

  it('switching agentId flushes pending save for previous agent and loads new agent note', async () => {
    saveNote('agent-b', 'note for b', 1_000_000)

    const wrapper = mountNotes('agent-a')
    await nextTick()

    // Type something for agent-a but don't wait for debounce
    const textarea = wrapper.find('textarea')
    await textarea.setValue('unsaved for a')
    await nextTick()

    // Switch to agent-b — should flush pending save for agent-a first
    await wrapper.setProps({ agentId: 'agent-b' })
    await flushPromises()
    await nextTick()

    // agent-a note should have been saved (flushed synchronously)
    const savedA = loadNote('agent-a')
    expect(savedA?.text).toBe('unsaved for a')

    // textarea should now show agent-b's note
    expect(wrapper.find('textarea').element.value).toBe('note for b')

    wrapper.unmount()
  })

  // ── Footer meta ───────────────────────────────────────────────────────────

  it('shows "尚未儲存" footer when no note exists', async () => {
    const wrapper = mountNotes('fresh-agent')
    await nextTick()

    expect(wrapper.find('.agent-notes-meta').text()).toContain('尚未儲存')

    wrapper.unmount()
  })

  it('shows char count in footer', async () => {
    saveNote('test-agent', 'hello', Date.now())

    const wrapper = mountNotes('test-agent')
    await nextTick()

    expect(wrapper.find('.agent-notes-meta').text()).toContain('5 字')

    wrapper.unmount()
  })
})
