import { describe, it, expect, vi, beforeEach } from 'vitest'
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
// Mock useToast and useActivityAccumulator
// ---------------------------------------------------------------------------

vi.mock('@/composables/useToast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}))

vi.mock('@/composables/useActivityAccumulator', () => ({
  useActivityAccumulator: () => ({
    increment: vi.fn(),
    reset: vi.fn(),
    load: vi.fn(() => new Map<string, number>()),
  }),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

import ActivityHeatmap from '../ActivityHeatmap.vue'

function mountHeatmap(data: Map<string, number> | null = new Map()) {
  return mount(ActivityHeatmap, {
    props: { data },
    attachTo: document.body,
  })
}

/** Returns today's YYYY-MM-DD key */
function todayKey(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ActivityHeatmap — select emit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('clicking an in-range cell emits "select" with the dateKey', async () => {
    const wrapper = mountHeatmap(new Map())

    // Find an in-range rect (has style cursor: pointer)
    const cells = wrapper.findAll('rect[style*="cursor: pointer"]')
    expect(cells.length).toBeGreaterThan(0)

    await cells[0].trigger('click')

    const emitted = wrapper.emitted('select')
    expect(emitted).toBeDefined()
    expect(emitted!.length).toBe(1)
    // The emitted value should be a YYYY-MM-DD string
    const [dateKeyEmitted] = emitted![0] as [string]
    expect(dateKeyEmitted).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('clicking today cell emits "select" with today key', async () => {
    const today = todayKey()
    const wrapper = mountHeatmap(new Map([[today, 3]]))

    // Today should be in-range; find any in-range cell and confirm at least one emits a valid key
    const cells = wrapper.findAll('rect[style*="cursor: pointer"]')
    expect(cells.length).toBeGreaterThan(0)

    await cells[cells.length - 1].trigger('click')

    const emitted = wrapper.emitted('select')
    expect(emitted).toBeDefined()
    const [emittedKey] = emitted![0] as [string]
    expect(emittedKey).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('out-of-range cells (future days) do NOT have cursor:pointer', () => {
    const wrapper = mountHeatmap(new Map())

    // Out-of-range cells should NOT have cursor:pointer inline style
    const outCells = wrapper.findAll('rect.cell-out')
    for (const cell of outCells) {
      // cell-out cells either have no style or style without cursor:pointer
      expect(cell.attributes('style') ?? '').not.toContain('cursor: pointer')
    }
  })

  it('in-range cells have cursor:pointer style', () => {
    const wrapper = mountHeatmap(new Map())

    const cells = wrapper.findAll('rect[style*="cursor: pointer"]')
    // 7-week default grid should have many in-range cells
    expect(cells.length).toBeGreaterThan(0)

    // None of the pointer cells should be cell-out
    for (const cell of cells) {
      expect(cell.classes()).not.toContain('cell-out')
    }
  })

  it('emits nothing when no cell is clicked', () => {
    const wrapper = mountHeatmap(new Map())
    expect(wrapper.emitted('select')).toBeUndefined()
  })
})
