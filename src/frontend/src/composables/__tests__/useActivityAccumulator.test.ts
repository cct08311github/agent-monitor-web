import { describe, it, expect, beforeEach } from 'vitest'
import { useActivityAccumulator } from '../useActivityAccumulator'

// ---------------------------------------------------------------------------
// Minimal in-memory Storage mock
// ---------------------------------------------------------------------------

function makeStorage(): Storage {
  const store: Record<string, string> = {}
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v },
    removeItem: (k: string) => { delete store[k] },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]) },
    key: (i: number) => Object.keys(store)[i] ?? null,
    get length() { return Object.keys(store).length },
  }
}

let storage: Storage

beforeEach(() => {
  storage = makeStorage()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useActivityAccumulator', () => {
  it('increment adds to today\'s count', () => {
    const { increment, load } = useActivityAccumulator(storage)
    const now = Date.now()
    increment(now)
    const counts = load()
    // Find today's key
    const today = new Date(now)
    const y = today.getFullYear()
    const m = String(today.getMonth() + 1).padStart(2, '0')
    const d = String(today.getDate()).padStart(2, '0')
    expect(counts.get(`${y}-${m}-${d}`)).toBe(1)
  })

  it('multiple increments on the same day aggregate', () => {
    const { increment, load } = useActivityAccumulator(storage)
    const base = new Date(2026, 3, 26, 10, 0).getTime()
    increment(base)
    increment(base + 1000)
    increment(base + 2000)
    const counts = load()
    expect(counts.get('2026-04-26')).toBe(3)
  })

  it('different days have separate counts', () => {
    const { increment, load } = useActivityAccumulator(storage)
    increment(new Date(2026, 3, 25, 12, 0).getTime())
    increment(new Date(2026, 3, 26, 12, 0).getTime())
    const counts = load()
    expect(counts.get('2026-04-25')).toBe(1)
    expect(counts.get('2026-04-26')).toBe(1)
  })

  it('90-day TTL pruning removes old entries on load', () => {
    const { load } = useActivityAccumulator(storage)
    // Manually inject an old entry
    const raw: Record<string, number> = {
      '2020-01-01': 5, // very old — should be pruned
      '2026-04-26': 3, // recent — should survive
    }
    storage.setItem('oc_activity_heatmap', JSON.stringify(raw))

    const counts = load()
    expect(counts.has('2020-01-01')).toBe(false)
    expect(counts.get('2026-04-26')).toBe(3)
  })

  it('load returns empty map when storage is empty', () => {
    const { load } = useActivityAccumulator(storage)
    expect(load().size).toBe(0)
  })

  it('defaults when parameter omitted increments for right-now', () => {
    const { increment, load } = useActivityAccumulator(storage)
    const before = Date.now()
    increment()
    const after = Date.now()
    const counts = load()
    // At least one of the possible today keys should have a count of 1
    const todayBefore = new Date(before)
    const todayAfter = new Date(after)
    const kBefore = `${todayBefore.getFullYear()}-${String(todayBefore.getMonth() + 1).padStart(2, '0')}-${String(todayBefore.getDate()).padStart(2, '0')}`
    const kAfter = `${todayAfter.getFullYear()}-${String(todayAfter.getMonth() + 1).padStart(2, '0')}-${String(todayAfter.getDate()).padStart(2, '0')}`
    const count = counts.get(kBefore) ?? counts.get(kAfter) ?? 0
    expect(count).toBe(1)
  })
})
