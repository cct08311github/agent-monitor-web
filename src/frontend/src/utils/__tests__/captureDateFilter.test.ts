import { describe, it, expect } from 'vitest'
import { inDateRange, filterByDateRange } from '../captureDateFilter'
import type { Capture } from '../quickCapture'

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
    expect(inDateRange(makeCapture(0), 'all', NOW)).toBe(true)
    expect(inDateRange(todayCapture, 'all', NOW)).toBe(true)
    expect(inDateRange(thirtyOneDaysAgo, 'all', NOW)).toBe(true)
  })

  it('"today" includes a capture made earlier today', () => {
    expect(inDateRange(todayCapture, 'today', NOW)).toBe(true)
  })

  it('"today" excludes a capture made yesterday', () => {
    expect(inDateRange(yesterdayCapture, 'today', NOW)).toBe(false)
  })

  it('"yesterday" includes a capture made yesterday', () => {
    expect(inDateRange(yesterdayCapture, 'yesterday', NOW)).toBe(true)
  })

  it('"yesterday" excludes a capture made today', () => {
    expect(inDateRange(todayCapture, 'yesterday', NOW)).toBe(false)
  })

  describe('boundary: midnight between yesterday and today', () => {
    it('capture at exact midnight (todayStart) is included in "today"', () => {
      const atMidnight = makeCapture(todayStart)
      expect(inDateRange(atMidnight, 'today', NOW)).toBe(true)
    })

    it('capture at 1 ms before midnight is included in "yesterday"', () => {
      const endOfYesterday = makeCapture(todayStart - 1)
      expect(inDateRange(endOfYesterday, 'yesterday', NOW)).toBe(true)
    })

    it('capture at 1 ms before midnight is NOT included in "today"', () => {
      const endOfYesterday = makeCapture(todayStart - 1)
      expect(inDateRange(endOfYesterday, 'today', NOW)).toBe(false)
    })
  })

  it('"last7d" includes a capture 6 days ago', () => {
    expect(inDateRange(sixDaysAgo, 'last7d', NOW)).toBe(true)
  })

  it('"last7d" excludes a capture 8 days ago', () => {
    expect(inDateRange(eightDaysAgo, 'last7d', NOW)).toBe(false)
  })

  it('"last30d" includes a capture 29 days ago', () => {
    expect(inDateRange(twentyNineDaysAgo, 'last30d', NOW)).toBe(true)
  })

  it('"last30d" excludes a capture 31 days ago', () => {
    expect(inDateRange(thirtyOneDaysAgo, 'last30d', NOW)).toBe(false)
  })
})

describe('filterByDateRange', () => {
  const all = [todayCapture, yesterdayCapture, sixDaysAgo, eightDaysAgo, twentyNineDaysAgo, thirtyOneDaysAgo]

  it('returns all captures for "all"', () => {
    expect(filterByDateRange(all, 'all', NOW)).toHaveLength(all.length)
  })

  it('"all" returns a new array (does not mutate input)', () => {
    const result = filterByDateRange(all, 'all', NOW)
    expect(result).not.toBe(all)
  })

  it('"today" returns only today\'s capture', () => {
    const result = filterByDateRange(all, 'today', NOW)
    expect(result).toHaveLength(1)
    expect(result[0]).toBe(todayCapture)
  })

  it('"yesterday" returns only yesterday\'s capture', () => {
    const result = filterByDateRange(all, 'yesterday', NOW)
    expect(result).toHaveLength(1)
    expect(result[0]).toBe(yesterdayCapture)
  })

  it('"last7d" includes today, yesterday, and 6-days-ago captures', () => {
    const result = filterByDateRange(all, 'last7d', NOW)
    expect(result).toContain(todayCapture)
    expect(result).toContain(yesterdayCapture)
    expect(result).toContain(sixDaysAgo)
    expect(result).not.toContain(eightDaysAgo)
  })

  it('"last30d" excludes captures older than 30 days', () => {
    const result = filterByDateRange(all, 'last30d', NOW)
    expect(result).not.toContain(thirtyOneDaysAgo)
    expect(result).toContain(twentyNineDaysAgo)
  })

  it('returns empty array for empty input', () => {
    expect(filterByDateRange([], 'today', NOW)).toEqual([])
    expect(filterByDateRange([], 'last7d', NOW)).toEqual([])
    expect(filterByDateRange([], 'all', NOW)).toEqual([])
  })

  it('local timezone is respected — startOfDay uses local Date methods', () => {
    // Create a capture at local midnight of the reference day (00:00:00.000)
    const localMidnight = makeCapture(todayStart)
    expect(inDateRange(localMidnight, 'today', NOW)).toBe(true)
    // The ms before midnight belongs to yesterday, not today
    expect(inDateRange(makeCapture(todayStart - 1), 'today', NOW)).toBe(false)
  })
})
