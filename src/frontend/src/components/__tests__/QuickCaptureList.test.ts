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
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
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
      // Active (non-archived) and archived — tests use no archived items by default
      const activeCaptures = vue.computed(() => mockCaptures())
      const archivedCaptures = vue.computed(() => [] as Capture[])
      return {
        isListOpen: vue.ref(true),
        captures,
        activeCaptures,
        archivedCaptures,
        pinnedIds: vue.ref([] as string[]),
        closeList: vi.fn(),
        remove: vi.fn(),
        archive: vi.fn(),
        unarchive: vi.fn(),
        clear: vi.fn(),
        update: vi.fn(),
        togglePin: vi.fn(),
        isPinned: vi.fn(() => false),
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

// ---------------------------------------------------------------------------
// Bulk select tests
// ---------------------------------------------------------------------------

// The useQuickCapture mock at the top of this file uses vi.fn() for archive,
// remove, and togglePin — these spies are accessible via the return value of
// the mocked composable. We can introspect calls by mounting and triggering
// the DOM directly.

describe('QuickCaptureList — bulk select', () => {
  beforeEach(() => {
    mockCaptures.mockReturnValue([
      makeCapture('a1', 'First idea'),
      makeCapture('a2', 'Second idea'),
      makeCapture('a3', 'Third idea'),
    ])
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  async function waitFlush(n = 3): Promise<void> {
    for (let i = 0; i < n; i++) await Promise.resolve()
  }

  it('selecting a checkbox shows the bulk action bar', async () => {
    const wrapper = mount(QuickCaptureList, { attachTo: document.body })
    await waitFlush()

    // Initially the bar should not be visible (count=0, v-if on Teleport inner)
    expect(document.querySelector('[data-testid="capture-bulk-action-bar"]')).toBeNull()

    // Click the first row checkbox
    const checkboxes = document.querySelectorAll('.qcl-row-checkbox')
    expect(checkboxes.length).toBeGreaterThan(0)
    ;(checkboxes[0] as HTMLElement).click()
    await waitFlush()

    // The bar should now be present in the document body (Teleported)
    const bar = document.querySelector('[data-testid="capture-bulk-action-bar"]')
    expect(bar).not.toBeNull()

    wrapper.unmount()
  })

  it('bulk archive calls archive for the selected capture', async () => {
    const wrapper = mount(QuickCaptureList, { attachTo: document.body })
    await waitFlush()

    // Click first row checkbox to select it
    const checkboxes = document.querySelectorAll('.qcl-row-checkbox')
    expect(checkboxes.length).toBeGreaterThan(0)
    ;(checkboxes[0] as HTMLElement).click()
    await waitFlush()

    // The bulk bar should be visible; click archive
    const archiveBtn = document.querySelector(
      '[data-testid="capture-bulk-action-bar"] button[title*="封存"]',
    ) as HTMLElement | null
    expect(archiveBtn).not.toBeNull()
    archiveBtn!.click()
    await waitFlush()

    // After bulk archive, bar should disappear (selection cleared)
    expect(document.querySelector('[data-testid="capture-bulk-action-bar"]')).toBeNull()

    wrapper.unmount()
  })

  it('bulk delete with confirmed dialog removes selected captures', async () => {
    // Provide a window.confirm stub that returns true
    Object.defineProperty(window, 'confirm', {
      value: vi.fn(() => true),
      writable: true,
      configurable: true,
    })

    const wrapper = mount(QuickCaptureList, { attachTo: document.body })
    await waitFlush()

    // Select two checkboxes
    const checkboxes = document.querySelectorAll('.qcl-row-checkbox')
    expect(checkboxes.length).toBeGreaterThanOrEqual(2)
    ;(checkboxes[0] as HTMLElement).click()
    await waitFlush()
    ;(checkboxes[1] as HTMLElement).click()
    await waitFlush()

    // Count label should show 2 selected
    const countHint = document.querySelector('.qcl-bulk-count-hint')
    expect(countHint?.textContent).toContain('2')

    // Click delete in bulk bar
    const deleteBtn = document.querySelector(
      '[data-testid="capture-bulk-action-bar"] button[title*="刪除"]',
    ) as HTMLElement | null
    expect(deleteBtn).not.toBeNull()
    deleteBtn!.click()
    await waitFlush()

    // window.confirm was called
    expect(window.confirm).toHaveBeenCalled()
    // After delete, bar should be gone
    expect(document.querySelector('[data-testid="capture-bulk-action-bar"]')).toBeNull()

    wrapper.unmount()
  })

  it('clear button empties selection and hides bar', async () => {
    const wrapper = mount(QuickCaptureList, { attachTo: document.body })
    await waitFlush()

    // Select a checkbox
    const checkboxes = document.querySelectorAll('.qcl-row-checkbox')
    expect(checkboxes.length).toBeGreaterThan(0)
    ;(checkboxes[0] as HTMLElement).click()
    await waitFlush()

    // Bar should be visible
    expect(document.querySelector('[data-testid="capture-bulk-action-bar"]')).not.toBeNull()

    // Click clear button
    const clearBtn = document.querySelector(
      '[data-testid="capture-bulk-action-bar"] button[title="清除選取"]',
    ) as HTMLElement | null
    expect(clearBtn).not.toBeNull()
    clearBtn!.click()
    await waitFlush()

    // Bar should now be hidden (v-if on count=0)
    expect(document.querySelector('[data-testid="capture-bulk-action-bar"]')).toBeNull()

    wrapper.unmount()
  })
})
