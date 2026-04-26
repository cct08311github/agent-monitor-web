import { describe, it, expect } from 'vitest'
import { inDateRange, filterByDateRange } from '../captureDateFilter'
import type { Capture } from '../quickCapture'
import type { DateRangeState } from '../captureDateFilter'

/**
 * Fixed reference point: 2024-03-15T12:00:00 local time.
 * All date boundaries are computed from this anchor.
 */
const NOW = new Date(2024, 2, 15, 12, 0, 0, 0) // month is 0-indexed → March

function makeCapture(ts: number): Capture {
  return { id: `c_${ts}`, body: 'test', context: 'test', createdAt: ts }
}

const todayStart = new Date(2024, 2, 15, 0, 0, 0, 0).getTime()
const dayMs = 24 * 60 * 60 * 1000

// Anchored timestamps
const todayCapture = makeCapture(todayStart + 6 * 60 * 60 * 1000) // 06:00 today
const yesterdayCapture = makeCapture(todayStart - 12 * 60 * 60 * 1000) // 12:00 yesterday
const sixDaysAgo = makeCapture(NOW.getTime() - 6 * dayMs)
const eightDaysAgo = makeCapture(NOW.getTime() - 8 * dayMs)
const twentyNineDaysAgo = makeCapture(NOW.getTime() - 29 * dayMs)
const thirtyOneDaysAgo = makeCapture(NOW.getTime() - 31 * dayMs)

describe('inDateRange', () => {
  it('always returns true for "all"', () => {
    expect(inDateRange(makeCapture(0), { range: 'all' }, NOW)).toBe(true)
    expect(inDateRange(todayCapture, { range: 'all' }, NOW)).toBe(true)
    expect(inDateRange(thirtyOneDaysAgo, { range: 'all' }, NOW)).toBe(true)
  })

  it('"today" includes a capture made earlier today', () => {
    expect(inDateRange(todayCapture, { range: 'today' }, NOW)).toBe(true)
  })

  it('"today" excludes a capture made yesterday', () => {
    expect(inDateRange(yesterdayCapture, { range: 'today' }, NOW)).toBe(false)
  })

  it('"yesterday" includes a capture made yesterday', () => {
    expect(inDateRange(yesterdayCapture, { range: 'yesterday' }, NOW)).toBe(true)
  })

  it('"yesterday" excludes a capture made today', () => {
    expect(inDateRange(todayCapture, { range: 'yesterday' }, NOW)).toBe(false)
  })

  describe('boundary: midnight between yesterday and today', () => {
    it('capture at exact midnight (todayStart) is included in "today"', () => {
      const atMidnight = makeCapture(todayStart)
      expect(inDateRange(atMidnight, { range: 'today' }, NOW)).toBe(true)
    })

    it('capture at 1 ms before midnight is included in "yesterday"', () => {
      const endOfYesterday = makeCapture(todayStart - 1)
      expect(inDateRange(endOfYesterday, { range: 'yesterday' }, NOW)).toBe(true)
    })

    it('capture at 1 ms before midnight is NOT included in "today"', () => {
      const endOfYesterday = makeCapture(todayStart - 1)
      expect(inDateRange(endOfYesterday, { range: 'today' }, NOW)).toBe(false)
    })
  })

  it('"last7d" includes a capture 6 days ago', () => {
    expect(inDateRange(sixDaysAgo, { range: 'last7d' }, NOW)).toBe(true)
  })

  it('"last7d" excludes a capture 8 days ago', () => {
    expect(inDateRange(eightDaysAgo, { range: 'last7d' }, NOW)).toBe(false)
  })

  it('"last30d" includes a capture 29 days ago', () => {
    expect(inDateRange(twentyNineDaysAgo, { range: 'last30d' }, NOW)).toBe(true)
  })

  it('"last30d" excludes a capture 31 days ago', () => {
    expect(inDateRange(thirtyOneDaysAgo, { range: 'last30d' }, NOW)).toBe(false)
  })

  // ── Custom range ────────────────────────────────────────────────────────

  describe('custom range', () => {
    // Reference dates for custom range tests (independent of NOW anchor):
    // from: 2026-04-15, to: 2026-04-20
    const fromStr = '2026-04-15'
    const toStr = '2026-04-20'
    // midnight local April 15
    const fromMidnight = new Date(2026, 3, 15, 0, 0, 0, 0).getTime()
    // midnight local April 20
    const toMidnight = new Date(2026, 3, 20, 0, 0, 0, 0).getTime()
    const endOfTo = toMidnight + dayMs - 1

    const state: DateRangeState = { range: 'custom', customFrom: fromStr, customTo: toStr }

    it('capture in range → true', () => {
      const mid = makeCapture(fromMidnight + 3 * 60 * 60 * 1000) // 03:00 on April 15
      expect(inDateRange(mid, state)).toBe(true)
    })

    it('capture in middle of range → true', () => {
      const mid = makeCapture(new Date(2026, 3, 17, 10, 0, 0, 0).getTime())
      expect(inDateRange(mid, state)).toBe(true)
    })

    it('capture before from → false', () => {
      const before = makeCapture(fromMidnight - 1)
      expect(inDateRange(before, state)).toBe(false)
    })

    it('capture after to (end-of-day) → false', () => {
      const after = makeCapture(endOfTo + 1)
      expect(inDateRange(after, state)).toBe(false)
    })

    it('capture at from midnight boundary → true (inclusive)', () => {
      const atFrom = makeCapture(fromMidnight)
      expect(inDateRange(atFrom, state)).toBe(true)
    })

    it('capture at end-of-to boundary → true (inclusive)', () => {
      const atEnd = makeCapture(endOfTo)
      expect(inDateRange(atEnd, state)).toBe(true)
    })

    it('from > to auto-swaps — capture is still matched', () => {
      // Reversed from/to should produce the same effective range
      const reversed: DateRangeState = { range: 'custom', customFrom: toStr, customTo: fromStr }
      const mid = makeCapture(fromMidnight + 3 * 60 * 60 * 1000)
      expect(inDateRange(mid, reversed)).toBe(true)
    })

    it('from > to auto-swaps — capture before the earlier date → false', () => {
      const reversed: DateRangeState = { range: 'custom', customFrom: toStr, customTo: fromStr }
      const before = makeCapture(fromMidnight - 1)
      expect(inDateRange(before, reversed)).toBe(false)
    })

    it('customFrom missing → no filter (returns true)', () => {
      const noFrom: DateRangeState = { range: 'custom', customTo: toStr }
      expect(inDateRange(makeCapture(0), noFrom)).toBe(true)
      expect(inDateRange(makeCapture(Date.now() + 1e10), noFrom)).toBe(true)
    })

    it('customTo missing → no filter (returns true)', () => {
      const noTo: DateRangeState = { range: 'custom', customFrom: fromStr }
      expect(inDateRange(makeCapture(0), noTo)).toBe(true)
      expect(inDateRange(makeCapture(Date.now() + 1e10), noTo)).toBe(true)
    })

    it('both customFrom and customTo missing → returns true (effectively "all")', () => {
      const neither: DateRangeState = { range: 'custom' }
      expect(inDateRange(makeCapture(0), neither)).toBe(true)
      expect(inDateRange(makeCapture(fromMidnight), neither)).toBe(true)
    })
  })
})

describe('filterByDateRange', () => {
  const all = [todayCapture, yesterdayCapture, sixDaysAgo, eightDaysAgo, twentyNineDaysAgo, thirtyOneDaysAgo]

  it('returns all captures for "all"', () => {
    expect(filterByDateRange(all, { range: 'all' }, NOW)).toHaveLength(all.length)
  })

  it('"all" returns a new array (does not mutate input)', () => {
    const result = filterByDateRange(all, { range: 'all' }, NOW)
    expect(result).not.toBe(all)
  })

  it('"today" returns only today\'s capture', () => {
    const result = filterByDateRange(all, { range: 'today' }, NOW)
    expect(result).toHaveLength(1)
    expect(result[0]).toBe(todayCapture)
  })

  it('"yesterday" returns only yesterday\'s capture', () => {
    const result = filterByDateRange(all, { range: 'yesterday' }, NOW)
    expect(result).toHaveLength(1)
    expect(result[0]).toBe(yesterdayCapture)
  })

  it('"last7d" includes today, yesterday, and 6-days-ago captures', () => {
    const result = filterByDateRange(all, { range: 'last7d' }, NOW)
    expect(result).toContain(todayCapture)
    expect(result).toContain(yesterdayCapture)
    expect(result).toContain(sixDaysAgo)
    expect(result).not.toContain(eightDaysAgo)
  })

  it('"last30d" excludes captures older than 30 days', () => {
    const result = filterByDateRange(all, { range: 'last30d' }, NOW)
    expect(result).not.toContain(thirtyOneDaysAgo)
    expect(result).toContain(twentyNineDaysAgo)
  })

  it('returns empty array for empty input', () => {
    expect(filterByDateRange([], { range: 'today' }, NOW)).toEqual([])
    expect(filterByDateRange([], { range: 'last7d' }, NOW)).toEqual([])
    expect(filterByDateRange([], { range: 'all' }, NOW)).toEqual([])
  })

  it('local timezone is respected — startOfDay uses local Date methods', () => {
    // Create a capture at local midnight of the reference day (00:00:00.000)
    const localMidnight = makeCapture(todayStart)
    expect(inDateRange(localMidnight, { range: 'today' }, NOW)).toBe(true)
    // The ms before midnight belongs to yesterday, not today
    expect(inDateRange(makeCapture(todayStart - 1), { range: 'today' }, NOW)).toBe(false)
  })

  describe('custom range filtering', () => {
    const from2026Apr15 = new Date(2026, 3, 15, 0, 0, 0, 0).getTime()
    const cInRange = makeCapture(from2026Apr15 + dayMs) // April 16 midnight
    const cBeforeRange = makeCapture(from2026Apr15 - 1) // 1ms before April 15
    const cAfterRange = makeCapture(new Date(2026, 3, 21, 0, 0, 0, 0).getTime()) // April 21

    const state: DateRangeState = { range: 'custom', customFrom: '2026-04-15', customTo: '2026-04-20' }

    it('filters captures to custom range', () => {
      const result = filterByDateRange([cInRange, cBeforeRange, cAfterRange], state)
      expect(result).toContain(cInRange)
      expect(result).not.toContain(cBeforeRange)
      expect(result).not.toContain(cAfterRange)
    })

    it('custom range with missing from → returns all captures', () => {
      const noFrom: DateRangeState = { range: 'custom', customTo: '2026-04-20' }
      const result = filterByDateRange([cInRange, cBeforeRange, cAfterRange], noFrom)
      expect(result).toHaveLength(3)
    })
  })
})
