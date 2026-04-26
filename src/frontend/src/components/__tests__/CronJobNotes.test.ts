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

import CronJobNotes from '../CronJobNotes.vue'
import { loadCronNote, saveCronNote } from '@/utils/cronNotes'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mountNotes(jobId = 'test-job') {
  return mount(CronJobNotes, {
    props: { jobId },
    attachTo: document.body,
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CronJobNotes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorageMock.clear()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ── Mount ─────────────────────────────────────────────────────────────────

  it('loads existing note on mount when jobId is given', async () => {
    const ts = 1_700_000_000_000
    saveCronNote('test-job', 'pre-existing cron note', ts)

    const wrapper = mountNotes('test-job')
    await nextTick()

    const textarea = wrapper.find('textarea')
    expect(textarea.element.value).toBe('pre-existing cron note')

    wrapper.unmount()
  })

  it('shows empty textarea when no note stored for job', async () => {
    const wrapper = mountNotes('brand-new-job')
    await nextTick()

    const textarea = wrapper.find('textarea')
    expect(textarea.element.value).toBe('')

    wrapper.unmount()
  })

  // ── Auto-save ─────────────────────────────────────────────────────────────

  it('typing text and waiting 800ms saves the note to localStorage', async () => {
    const wrapper = mountNotes('test-job')
    await nextTick()

    const textarea = wrapper.find('textarea')
    await textarea.setValue('my cron note')
    await nextTick()

    // Before debounce — not saved yet
    expect(loadCronNote('test-job')).toBeNull()

    // Advance past debounce threshold
    await vi.advanceTimersByTimeAsync(800)
    await flushPromises()
    await nextTick()

    const saved = loadCronNote('test-job')
    expect(saved).not.toBeNull()
    expect(saved?.text).toBe('my cron note')

    wrapper.unmount()
  })

  // ── Clear ─────────────────────────────────────────────────────────────────

  it('clearing (after confirm) empties the textarea AND removes localStorage entry', async () => {
    saveCronNote('test-job', 'some cron note', Date.now())

    vi.stubGlobal('confirm', () => true)

    const wrapper = mountNotes('test-job')
    await nextTick()

    expect(wrapper.find('textarea').element.value).toBe('some cron note')

    const clearBtn = wrapper.find('.cron-job-notes-clear-btn')
    expect(clearBtn.exists()).toBe(true)
    await clearBtn.trigger('click')
    await nextTick()

    expect(wrapper.find('textarea').element.value).toBe('')
    expect(loadCronNote('test-job')).toBeNull()
    expect(mockInfo).toHaveBeenCalledWith('筆記已清除')

    wrapper.unmount()
  })

  // ── Markdown toolbar ──────────────────────────────────────────────────────

  it('renders all 5 markdown toolbar buttons', async () => {
    const wrapper = mountNotes()
    await nextTick()

    const toolbar = wrapper.find('.cron-job-notes-md-toolbar')
    expect(toolbar.exists()).toBe(true)

    const buttons = toolbar.findAll('button')
    expect(buttons).toHaveLength(5)

    wrapper.unmount()
  })

  it('clicking B wraps selected text in ** bold markers **', async () => {
    const wrapper = mountNotes()
    await nextTick()

    const textarea = wrapper.find('textarea')
    await textarea.setValue('hello world')
    await nextTick()

    // Simulate selection of "world" (start=6, end=11)
    const ta = textarea.element as HTMLTextAreaElement
    ta.selectionStart = 6
    ta.selectionEnd = 11

    // Click bold button (first button in toolbar)
    const boldBtn = wrapper.find('.cron-job-notes-md-toolbar button:first-child')
    await boldBtn.trigger('click')
    await nextTick()

    expect(ta.value).toBe('hello **world**')

    wrapper.unmount()
  })

  it('clicking I wraps selected text in * italic markers *', async () => {
    const wrapper = mountNotes()
    await nextTick()

    const textarea = wrapper.find('textarea')
    await textarea.setValue('hello world')
    await nextTick()

    const ta = textarea.element as HTMLTextAreaElement
    ta.selectionStart = 6
    ta.selectionEnd = 11

    const italicBtn = wrapper.findAll('.cron-job-notes-md-toolbar button')[1]
    await italicBtn.trigger('click')
    await nextTick()

    expect(ta.value).toBe('hello *world*')

    wrapper.unmount()
  })

  it('clicking code button wraps selected text in backticks', async () => {
    const wrapper = mountNotes()
    await nextTick()

    const textarea = wrapper.find('textarea')
    await textarea.setValue('run this')
    await nextTick()

    const ta = textarea.element as HTMLTextAreaElement
    ta.selectionStart = 4
    ta.selectionEnd = 8

    const codeBtn = wrapper.findAll('.cron-job-notes-md-toolbar button')[2]
    await codeBtn.trigger('click')
    await nextTick()

    expect(ta.value).toBe('run `this`')

    wrapper.unmount()
  })

  it('toolbar has correct aria-label for accessibility', async () => {
    const wrapper = mountNotes()
    await nextTick()

    const toolbar = wrapper.find('.cron-job-notes-md-toolbar')
    expect(toolbar.attributes('aria-label')).toBe('Markdown 格式工具列')
    expect(toolbar.attributes('role')).toBe('toolbar')

    wrapper.unmount()
  })

  // ── Footer meta ───────────────────────────────────────────────────────────

  it('shows "尚未儲存" footer when no note exists', async () => {
    const wrapper = mountNotes('fresh-job')
    await nextTick()

    expect(wrapper.find('.cron-job-notes-meta').text()).toContain('尚未儲存')

    wrapper.unmount()
  })

  it('shows char count in footer', async () => {
    saveCronNote('test-job', 'hello', Date.now())

    const wrapper = mountNotes('test-job')
    await nextTick()

    expect(wrapper.find('.cron-job-notes-meta').text()).toContain('5 字')

    wrapper.unmount()
  })
})
