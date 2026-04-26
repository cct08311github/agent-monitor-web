import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  loadOrder,
  saveOrder,
  clearOrder,
  reorder,
  applyOrder,
} from '../agentOrder'

// ---------------------------------------------------------------------------
// localStorage mock
// ---------------------------------------------------------------------------

const store: Record<string, string> = {}

const localStorageMock = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => {
    store[key] = value
  },
  removeItem: (key: string) => {
    delete store[key]
  },
  clear: () => {
    for (const k of Object.keys(store)) delete store[k]
  },
  length: 0,
  key: (_i: number) => null,
}

beforeEach(() => {
  vi.stubGlobal('localStorage', localStorageMock)
  localStorageMock.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ---------------------------------------------------------------------------
// loadOrder
// ---------------------------------------------------------------------------

describe('loadOrder', () => {
  it('returns [] when nothing is stored', () => {
    expect(loadOrder()).toEqual([])
  })

  it('returns [] on corrupt JSON', () => {
    store['oc_agent_order'] = '{ not valid json'
    expect(loadOrder()).toEqual([])
  })

  it('filters non-string entries from stored array', () => {
    store['oc_agent_order'] = JSON.stringify(['a', 1, null, 'b', true])
    expect(loadOrder()).toEqual(['a', 'b'])
  })

  it('returns [] when stored value is not an array', () => {
    store['oc_agent_order'] = JSON.stringify({ id: 'a' })
    expect(loadOrder()).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// saveOrder + loadOrder round-trip
// ---------------------------------------------------------------------------

describe('saveOrder + loadOrder', () => {
  it('round-trips an array of strings', () => {
    saveOrder(['x', 'y', 'z'])
    expect(loadOrder()).toEqual(['x', 'y', 'z'])
  })

  it('round-trips an empty array', () => {
    saveOrder([])
    expect(loadOrder()).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// clearOrder
// ---------------------------------------------------------------------------

describe('clearOrder', () => {
  it('removes the stored key so loadOrder returns []', () => {
    saveOrder(['a', 'b'])
    clearOrder()
    expect(loadOrder()).toEqual([])
  })

  it('is a no-op when key was never set', () => {
    expect(() => clearOrder()).not.toThrow()
    expect(loadOrder()).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// reorder
// ---------------------------------------------------------------------------

describe('reorder', () => {
  it('returns same order (copy) when dragId === dropId', () => {
    const result = reorder(['a', 'b', 'c'], 'a', 'a')
    expect(result).toEqual(['a', 'b', 'c'])
  })

  it('moves last item before first: c→a yields [c, a, b]', () => {
    expect(reorder(['a', 'b', 'c'], 'c', 'a')).toEqual(['c', 'a', 'b'])
  })

  it('moves first item before last: a→c yields [b, a, c]', () => {
    expect(reorder(['a', 'b', 'c'], 'a', 'c')).toEqual(['b', 'a', 'c'])
  })

  it('moves middle item before first: b→a yields [b, a, c]', () => {
    expect(reorder(['a', 'b', 'c'], 'b', 'a')).toEqual(['b', 'a', 'c'])
  })

  it('returns copy when dragId is not in currentIds', () => {
    expect(reorder(['a', 'b', 'c'], 'x', 'a')).toEqual(['a', 'b', 'c'])
  })

  it('returns copy when dropId is not in currentIds', () => {
    expect(reorder(['a', 'b', 'c'], 'a', 'x')).toEqual(['a', 'b', 'c'])
  })

  it('returns a new array (does not mutate input)', () => {
    const input = ['a', 'b', 'c'] as const
    const result = reorder(input, 'c', 'a')
    expect(result).not.toBe(input)
  })
})

// ---------------------------------------------------------------------------
// applyOrder
// ---------------------------------------------------------------------------

describe('applyOrder', () => {
  it('applies saved order and appends unlisted items at end', () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    const result = applyOrder(items, ['c', 'a'])
    expect(result.map((x) => x.id)).toEqual(['c', 'a', 'b'])
  })

  it('returns [] when items is empty', () => {
    expect(applyOrder([], ['x'])).toEqual([])
  })

  it('returns all items in original order when order is []', () => {
    const items = [{ id: 'a' }, { id: 'b' }]
    expect(applyOrder(items, []).map((x) => x.id)).toEqual(['a', 'b'])
  })

  it('skips order entries that do not match any item', () => {
    const items = [{ id: 'a' }, { id: 'b' }]
    const result = applyOrder(items, ['ghost', 'b', 'a'])
    expect(result.map((x) => x.id)).toEqual(['b', 'a'])
  })

  it('does not duplicate items that appear multiple times in order', () => {
    const items = [{ id: 'a' }, { id: 'b' }]
    const result = applyOrder(items, ['a', 'a', 'b'])
    expect(result.map((x) => x.id)).toEqual(['a', 'b'])
  })

  it('preserves extra fields on items', () => {
    const items = [
      { id: 'a', name: 'Alpha' },
      { id: 'b', name: 'Bravo' },
    ]
    const result = applyOrder(items, ['b', 'a'])
    expect(result[0]).toEqual({ id: 'b', name: 'Bravo' })
    expect(result[1]).toEqual({ id: 'a', name: 'Alpha' })
  })
})
