import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import type { Capture } from '@/utils/quickCapture'

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
// Helpers
// ---------------------------------------------------------------------------

import CaptureHeatmap from '../CaptureHeatmap.vue'

function makeCapture(id: string, body: string, daysAgo = 0): Capture {
  const ts = Date.now() - daysAgo * 24 * 60 * 60 * 1000
  return { id, body, context: 'test', createdAt: ts }
}

function mountHeatmap(captures: Capture[] = [], days = 30) {
  return mount(CaptureHeatmap, {
    props: { captures, days },
    attachTo: document.body,
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CaptureHeatmap — select emit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('all cells have cursor:pointer style', () => {
    const wrapper = mountHeatmap()

    const cells = wrapper.findAll('rect[style*="cursor: pointer"]')
    expect(cells.length).toBe(30)
  })

  it('clicking a cell emits "select" with a YYYY-MM-DD dateKey', async () => {
    const captures = [makeCapture('1', 'test capture', 2)]
    const wrapper = mountHeatmap(captures)

    const cells = wrapper.findAll('rect')
    expect(cells.length).toBeGreaterThan(0)

    await cells[0].trigger('click')

    const emitted = wrapper.emitted('select')
    expect(emitted).toBeDefined()
    expect(emitted!.length).toBe(1)
    const [dateKeyEmitted] = emitted![0] as [string]
    expect(dateKeyEmitted).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('clicking multiple cells emits "select" each time', async () => {
    const wrapper = mountHeatmap([makeCapture('1', 'test', 0)])

    const cells = wrapper.findAll('rect')
    await cells[0].trigger('click')
    await cells[1].trigger('click')
    await cells[2].trigger('click')

    const emitted = wrapper.emitted('select')
    expect(emitted).toBeDefined()
    expect(emitted!.length).toBe(3)
  })

  it('each cell emits a unique or ordered dateKey corresponding to grid position', async () => {
    const wrapper = mountHeatmap()

    const cells = wrapper.findAll('rect')
    // Click first and last cell — keys should be different dates
    await cells[0].trigger('click')
    await cells[cells.length - 1].trigger('click')

    const emitted = wrapper.emitted('select') as [string][]
    expect(emitted.length).toBe(2)
    // Both should be valid date strings
    expect(emitted[0][0]).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(emitted[1][0]).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    // The two dates should differ
    expect(emitted[0][0]).not.toBe(emitted[1][0])
  })

  it('emits nothing when no cell is clicked', () => {
    const wrapper = mountHeatmap()
    expect(wrapper.emitted('select')).toBeUndefined()
  })
})
