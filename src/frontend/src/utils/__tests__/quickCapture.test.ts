import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  loadCaptures,
  addCapture,
  deleteCapture,
  clearCaptures,
  generateId,
  type Capture,
} from '../quickCapture'

// ---------------------------------------------------------------------------
// localStorage stub
// ---------------------------------------------------------------------------

function makeLocalStorageStub() {
  const store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      Object.keys(store).forEach((k) => delete store[k])
    },
    get length() {
      return Object.keys(store).length
    },
    key: (index: number) => Object.keys(store)[index] ?? null,
  }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', makeLocalStorageStub())
})

// ---------------------------------------------------------------------------
// loadCaptures
// ---------------------------------------------------------------------------

describe('loadCaptures', () => {
  it('returns [] when nothing is stored', () => {
    expect(loadCaptures()).toEqual([])
  })

  it('returns [] when stored JSON is corrupt', () => {
    localStorage.setItem('oc_quick_captures', 'not-json{{{')
    expect(loadCaptures()).toEqual([])
  })

  it('filters out invalid entries', () => {
    const valid: Capture = { id: 'qc_1', body: 'hello', context: 'MonitorTab', createdAt: 1000 }
    const invalid = { id: 42, body: 'bad', context: 'x', createdAt: 1000 }
    localStorage.setItem('oc_quick_captures', JSON.stringify([valid, invalid]))
    expect(loadCaptures()).toEqual([valid])
  })
})

// ---------------------------------------------------------------------------
// addCapture
// ---------------------------------------------------------------------------

describe('addCapture', () => {
  it('round-trip preserves body, context, and createdAt', () => {
    const c = addCapture('test body', 'LogsTab', 9999)
    expect(c.body).toBe('test body')
    expect(c.context).toBe('LogsTab')
    expect(c.createdAt).toBe(9999)
  })

  it('puts newest at the front', () => {
    const first = addCapture('first', 'ctx', 1000)
    const second = addCapture('second', 'ctx', 2000)
    const all = loadCaptures()
    expect(all[0]?.id).toBe(second.id)
    expect(all[1]?.id).toBe(first.id)
  })

  it('caps to 100 — the 101st entry drops the oldest', () => {
    // Add 100 captures with timestamps 1..100
    for (let i = 1; i <= 100; i++) {
      addCapture(`item ${i}`, 'ctx', i)
    }
    const before = loadCaptures()
    expect(before).toHaveLength(100)
    // The oldest should be item 1 (createdAt=1)
    const oldest = before[before.length - 1]
    expect(oldest?.createdAt).toBe(1)

    // Add 101st
    addCapture('item 101', 'ctx', 101)
    const after = loadCaptures()
    expect(after).toHaveLength(100)
    // Oldest (createdAt=1) should be gone
    const ids = after.map((c) => c.createdAt)
    expect(ids).not.toContain(1)
    expect(ids[0]).toBe(101)
  })
})

// ---------------------------------------------------------------------------
// deleteCapture
// ---------------------------------------------------------------------------

describe('deleteCapture', () => {
  it('removes the capture with matching id', () => {
    const a = addCapture('aaa', 'ctx', 1)
    const b = addCapture('bbb', 'ctx', 2)
    deleteCapture(a.id)
    const all = loadCaptures()
    expect(all.map((c) => c.id)).not.toContain(a.id)
    expect(all.map((c) => c.id)).toContain(b.id)
  })

  it('is a no-op when id does not exist', () => {
    addCapture('only', 'ctx', 1)
    deleteCapture('non-existent-id')
    expect(loadCaptures()).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// clearCaptures
// ---------------------------------------------------------------------------

describe('clearCaptures', () => {
  it('empties all captures', () => {
    addCapture('one', 'ctx', 1)
    addCapture('two', 'ctx', 2)
    clearCaptures()
    expect(loadCaptures()).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// generateId
// ---------------------------------------------------------------------------

describe('generateId', () => {
  it('distinct calls produce different ids', () => {
    const ids = new Set(Array.from({ length: 50 }, (_, i) => generateId(i)))
    expect(ids.size).toBe(50)
  })
})
