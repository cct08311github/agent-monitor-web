import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'

// ---------------------------------------------------------------------------
// Mock localStorage
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
    for (const key of Object.keys(_lsStore)) {
      delete _lsStore[key]
    }
  }),
}

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
})

// ---------------------------------------------------------------------------
// Mock useToast
// ---------------------------------------------------------------------------

vi.mock('@/composables/useToast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}))

// ---------------------------------------------------------------------------
// Mock createFocusTrap
// ---------------------------------------------------------------------------

vi.mock('@/lib/focusTrap', () => ({
  createFocusTrap: () => ({
    activate: vi.fn(),
    deactivate: vi.fn(),
  }),
}))

// ---------------------------------------------------------------------------
// Seed captures via composable mock
// ---------------------------------------------------------------------------

import type { Capture } from '@/utils/quickCapture'

function makeCapture(id: string, body: string, context = 'dashboard'): Capture {
  return { id, body, context, createdAt: Date.now() }
}

const mockCaptures = vi.fn(() => [] as Capture[])

vi.mock('@/composables/useQuickCapture', async () => {
  const vue = await import('vue')
  return {
    useQuickCapture: () => {
      const captures = vue.computed(() => mockCaptures())
      return {
        isListOpen: vue.ref(true),
        captures,
        closeList: vi.fn(),
        remove: vi.fn(),
        clear: vi.fn(),
      }
    },
  }
})

import QuickCaptureList from '../QuickCaptureList.vue'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// QuickCaptureList uses <Teleport to="body"> — content renders into document.body,
// not inside the wrapper. Use document.querySelector to inspect it.

function mountList() {
  return mount(QuickCaptureList, { attachTo: document.body })
}

async function setInput(value: string): Promise<void> {
  const input = document.querySelector('.qc-search') as HTMLInputElement | null
  if (!input) throw new Error('.qc-search not found in document')
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
  // Yield to Vue's async reactivity
  await Promise.resolve()
  await Promise.resolve()
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('QuickCaptureList — search', () => {
  beforeEach(() => {
    mockCaptures.mockReturnValue([])
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders the search input', () => {
    const wrapper = mountList()
    expect(document.querySelector('.qc-search')).not.toBeNull()
    wrapper.unmount()
  })

  it('search query filters captures by body content (fuzzy)', async () => {
    mockCaptures.mockReturnValue([
      makeCapture('1', 'Observability design notes'),
      makeCapture('2', 'Shopping list for dinner'),
      makeCapture('3', 'obs tracing idea'),
    ])

    const wrapper = mountList()
    await setInput('obs')

    const items = document.querySelectorAll('.qcl-item-body')
    const texts = Array.from(items).map((el) => el.textContent ?? '')

    // Both 'Observability...' and 'obs tracing...' should match
    expect(texts.length).toBe(2)
    expect(texts.some((t) => t.includes('Observability'))).toBe(true)
    expect(texts.some((t) => t.includes('obs tracing'))).toBe(true)
    // 'Shopping list' should NOT match
    expect(texts.some((t) => t.includes('Shopping'))).toBe(false)

    wrapper.unmount()
  })

  it('search and tag filter combine (AND logic)', async () => {
    mockCaptures.mockReturnValue([
      makeCapture('1', 'Observability #backend notes'),
      makeCapture('2', 'obs design #frontend'),
      makeCapture('3', 'obs tracing #backend idea'),
    ])

    const wrapper = mountList()

    // Click the #backend tag chip
    const tagChips = Array.from(document.querySelectorAll('.tag-chip'))
    const backendChip = tagChips.find((c) => c.textContent?.includes('backend')) as
      | HTMLElement
      | undefined
    expect(backendChip).toBeDefined()
    backendChip!.click()
    await Promise.resolve()
    await Promise.resolve()

    // Also set search query
    await setInput('obs')

    const items = document.querySelectorAll('.qcl-item-body')
    const texts = Array.from(items).map((el) => el.textContent ?? '')

    // Items must have 'obs' match AND #backend tag — excludes #frontend capture
    expect(texts.some((t) => t.includes('#frontend'))).toBe(false)
    // The matching backend items contain obs
    expect(texts.length).toBeGreaterThan(0)

    wrapper.unmount()
  })

  it('empty search query keeps tag filter active', async () => {
    mockCaptures.mockReturnValue([
      makeCapture('1', 'Frontend thought #frontend'),
      makeCapture('2', 'Backend thought #backend'),
    ])

    const wrapper = mountList()

    // Click #frontend chip
    const tagChips = Array.from(document.querySelectorAll('.tag-chip'))
    const frontendChip = tagChips.find((c) => c.textContent?.includes('frontend')) as
      | HTMLElement
      | undefined
    expect(frontendChip).toBeDefined()
    frontendChip!.click()
    await Promise.resolve()
    await Promise.resolve()

    // Leave search empty
    await setInput('')

    const items = document.querySelectorAll('.qcl-item-body')
    const texts = Array.from(items).map((el) => el.textContent ?? '')

    expect(texts.length).toBe(1)
    expect(texts[0]).toContain('#frontend')

    wrapper.unmount()
  })

  it('search is case-insensitive', async () => {
    mockCaptures.mockReturnValue([
      makeCapture('1', 'Performance Optimization Notes'),
      makeCapture('2', 'unrelated item'),
    ])

    const wrapper = mountList()
    await setInput('PERFORMANCE')

    const items = document.querySelectorAll('.qcl-item-body')
    const texts = Array.from(items).map((el) => el.textContent ?? '')

    expect(texts.length).toBe(1)
    expect(texts[0]).toContain('Performance Optimization')

    wrapper.unmount()
  })

  it('shows correct empty state message when only search is active', async () => {
    mockCaptures.mockReturnValue([makeCapture('1', 'Some note')])

    const wrapper = mountList()
    await setInput('xyzzy_no_match')

    const empty = document.querySelector('.qcl-empty')
    expect(empty).not.toBeNull()
    expect(empty!.textContent).toContain('無符合搜尋的 capture')

    wrapper.unmount()
  })

  it('shows correct empty state when both search and tag filter yield no results', async () => {
    mockCaptures.mockReturnValue([makeCapture('1', 'obs note #backend')])

    const wrapper = mountList()

    // Activate tag filter
    const tagChips = Array.from(document.querySelectorAll('.tag-chip'))
    const backendChip = tagChips.find((c) => c.textContent?.includes('backend')) as
      | HTMLElement
      | undefined
    expect(backendChip).toBeDefined()
    backendChip!.click()
    await Promise.resolve()
    await Promise.resolve()

    // Set search that does not match
    await setInput('xyzzy_no_match')

    const empty = document.querySelector('.qcl-empty')
    expect(empty).not.toBeNull()
    expect(empty!.textContent).toContain('此篩選下無 capture')

    wrapper.unmount()
  })

  it('shows filter count label when search or tag is active', async () => {
    mockCaptures.mockReturnValue([
      makeCapture('1', 'obs note one'),
      makeCapture('2', 'obs note two'),
      makeCapture('3', 'unrelated'),
    ])

    const wrapper = mountList()
    await setInput('obs')

    const countLabel = document.querySelector('.qcl-filter-count')
    expect(countLabel).not.toBeNull()
    expect(countLabel!.textContent).toContain('篩選:')
    expect(countLabel!.textContent).toContain('2')
    expect(countLabel!.textContent).toContain('3')

    wrapper.unmount()
  })
})
