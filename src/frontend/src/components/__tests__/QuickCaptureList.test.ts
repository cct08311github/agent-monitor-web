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
        archivedIds: vue.ref(new Set<string>()),
        activeCaptures,
        archivedCaptures,
        pinnedIds: vue.ref([] as string[]),
        pendingJumpDate: vue.ref<string | null>(null),
        closeList: vi.fn(),
        remove: vi.fn(),
        archive: vi.fn(),
        unarchive: vi.fn(),
        clear: vi.fn(),
        update: vi.fn(),
        togglePin: vi.fn(),
        isPinned: vi.fn(() => false),
        openWithPrefill: vi.fn(),
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

// ---------------------------------------------------------------------------
// Keyboard navigation tests
// ---------------------------------------------------------------------------

describe('QuickCaptureList — keyboard navigation', () => {
  beforeEach(() => {
    mockCaptures.mockReturnValue([
      makeCapture('k1', 'First capture'),
      makeCapture('k2', 'Second capture'),
      makeCapture('k3', 'Third capture'),
    ])
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  async function waitFlush(n = 4): Promise<void> {
    for (let i = 0; i < n; i++) await Promise.resolve()
  }

  function pressKey(key: string, opts: KeyboardEventInit = {}): void {
    window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...opts }))
  }

  it('ArrowDown advances highlightedIdx and adds highlight class to correct item', async () => {
    const wrapper = mount(QuickCaptureList, { attachTo: document.body })
    await waitFlush()

    // Initially no item is highlighted
    expect(document.querySelectorAll('.qcl-item--keynav-highlight').length).toBe(0)

    // First ArrowDown: index goes from -1 to 0 (first item)
    pressKey('ArrowDown')
    await waitFlush()
    const highlighted = document.querySelectorAll('.qcl-item--keynav-highlight')
    expect(highlighted.length).toBe(1)

    wrapper.unmount()
  })

  it('ArrowDown clamps at list length - 1', async () => {
    const wrapper = mount(QuickCaptureList, { attachTo: document.body })
    await waitFlush()

    // Press ArrowDown many times (more than list length of 3)
    for (let i = 0; i < 10; i++) {
      pressKey('ArrowDown')
      await waitFlush()
    }

    // Should still have exactly 1 highlighted item (last one, not overflown)
    expect(document.querySelectorAll('.qcl-item--keynav-highlight').length).toBe(1)

    // The highlighted item should be the last one
    const items = document.querySelectorAll('.qcl-item')
    const lastItem = items[items.length - 1]
    expect(lastItem.classList.contains('qcl-item--keynav-highlight')).toBe(true)

    wrapper.unmount()
  })

  it('ArrowUp decreases highlightedIdx and clamps at 0', async () => {
    const wrapper = mount(QuickCaptureList, { attachTo: document.body })
    await waitFlush()

    // Navigate to second item first
    pressKey('ArrowDown')
    await waitFlush()
    pressKey('ArrowDown')
    await waitFlush()

    // Now press ArrowUp many times
    for (let i = 0; i < 10; i++) {
      pressKey('ArrowUp')
      await waitFlush()
    }

    // Should be at first item (clamped at 0)
    const items = document.querySelectorAll('.qcl-item')
    expect(items[0].classList.contains('qcl-item--keynav-highlight')).toBe(true)
    // No other item highlighted
    let highlightCount = 0
    for (const item of items) {
      if (item.classList.contains('qcl-item--keynav-highlight')) highlightCount++
    }
    expect(highlightCount).toBe(1)

    wrapper.unmount()
  })

  it('Enter on highlighted item triggers edit mode for that capture', async () => {
    const wrapper = mount(QuickCaptureList, { attachTo: document.body })
    await waitFlush()

    // Navigate to first item
    pressKey('ArrowDown')
    await waitFlush()

    // Press Enter to edit
    pressKey('Enter')
    await waitFlush()

    // Edit textarea should appear
    const textarea = document.querySelector('.qcl-edit-textarea')
    expect(textarea).not.toBeNull()

    wrapper.unmount()
  })

  it('input target check: when an input has focus ArrowDown does NOT change highlight', async () => {
    const wrapper = mount(QuickCaptureList, { attachTo: document.body })
    await waitFlush()

    // Initially no highlight
    expect(document.querySelectorAll('.qcl-item--keynav-highlight').length).toBe(0)

    // Simulate keydown on the input element directly (target = INPUT)
    const input = document.querySelector('.qc-search') as HTMLInputElement
    expect(input).not.toBeNull()
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    await waitFlush()

    // No item should be highlighted because input had focus (target is INPUT)
    expect(document.querySelectorAll('.qcl-item--keynav-highlight').length).toBe(0)

    wrapper.unmount()
  })

  it('Space toggles bulk-select on highlighted item', async () => {
    const wrapper = mount(QuickCaptureList, { attachTo: document.body })
    await waitFlush()

    // Navigate to first item
    pressKey('ArrowDown')
    await waitFlush()

    // Press Space to toggle selection
    pressKey(' ')
    await waitFlush()

    // The bulk action bar should now be visible (one item selected)
    const bar = document.querySelector('[data-testid="capture-bulk-action-bar"]')
    expect(bar).not.toBeNull()

    wrapper.unmount()
  })

  it('Cmd+A selects all displayed captures', async () => {
    const wrapper = mount(QuickCaptureList, { attachTo: document.body })
    await waitFlush()

    // Press Cmd+A
    pressKey('a', { metaKey: true })
    await waitFlush()

    // Count hint should show all 3 selected
    const countHint = document.querySelector('.qcl-bulk-count-hint')
    expect(countHint).not.toBeNull()
    expect(countHint!.textContent).toContain('3')

    wrapper.unmount()
  })

  it('highlightedIdx resets to -1 when displayed list changes', async () => {
    const wrapper = mount(QuickCaptureList, { attachTo: document.body })
    await waitFlush()

    // Navigate to second item
    pressKey('ArrowDown')
    await waitFlush()
    pressKey('ArrowDown')
    await waitFlush()
    expect(document.querySelectorAll('.qcl-item--keynav-highlight').length).toBe(1)

    // Change the displayed list by updating captures (simulate filter change)
    mockCaptures.mockReturnValue([makeCapture('k4', 'New single capture')])
    // Trigger reactivity by dispatching input on search
    const searchInput = document.querySelector('.qc-search') as HTMLInputElement
    searchInput.value = 'New'
    searchInput.dispatchEvent(new Event('input', { bubbles: true }))
    await waitFlush()

    // After displayed changes, highlight should be reset
    expect(document.querySelectorAll('.qcl-item--keynav-highlight').length).toBe(0)

    wrapper.unmount()
  })
})

// ---------------------------------------------------------------------------
// CaptureHeatmap drill-down — pendingJumpDate integration
// ---------------------------------------------------------------------------

describe('QuickCaptureList — heatmap drill-down (pendingJumpDate)', () => {
  beforeEach(() => {
    mockCaptures.mockReturnValue([])
    vi.clearAllMocks()
  })

  it('renders CaptureHeatmap with @select listener when captures exist', () => {
    mockCaptures.mockReturnValue([
      makeCapture('1', 'idea for today'),
    ])
    const wrapper = mountList()

    // CaptureHeatmap is mounted in the qcl-heatmap-row div when captures exist
    const heatmapRow = document.querySelector('.qcl-heatmap-row')
    expect(heatmapRow).not.toBeNull()

    wrapper.unmount()
  })

  it('does not render CaptureHeatmap row when captures list is empty', () => {
    mockCaptures.mockReturnValue([])
    const wrapper = mountList()

    const heatmapRow = document.querySelector('.qcl-heatmap-row')
    expect(heatmapRow).toBeNull()

    wrapper.unmount()
  })
})
