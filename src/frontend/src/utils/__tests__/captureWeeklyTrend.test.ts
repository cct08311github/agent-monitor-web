import { describe, it, expect } from 'vitest'
import { computeWeeklyTrend, trendLabel } from '../captureWeeklyTrend'
import type { Capture } from '../quickCapture'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000

// Fixed reference point for all tests: 2024-01-15 12:00:00 UTC
const NOW = new Date('2024-01-15T12:00:00.000Z')
const NOW_MS = NOW.getTime()

function makeCapture(id: string, ageMs: number): Capture {
  return {
    id,
    body: `capture ${id}`,
    context: 'test',
    createdAt: NOW_MS - ageMs,
  }
}

/** Helper: N captures, all within the last 7 days */
function thisWeekCaptures(n: number): Capture[] {
  return Array.from({ length: n }, (_, i) =>
    makeCapture(`tw-${i}`, (i + 1) * DAY_MS * 0.5), // 0.5, 1, 1.5 ... days ago
  )
}

/** Helper: N captures, all between 7-14 days ago */
function lastWeekCaptures(n: number): Capture[] {
  return Array.from({ length: n }, (_, i) =>
    makeCapture(`lw-${i}`, 7 * DAY_MS + (i + 1) * DAY_MS * 0.5),
  )
}

// ---------------------------------------------------------------------------
// computeWeeklyTrend
// ---------------------------------------------------------------------------

describe('computeWeeklyTrend', () => {
  it('returns null when both windows are empty', () => {
    expect(computeWeeklyTrend([], NOW)).toBeNull()
  })

  it('returns null when all captures are older than 14 days', () => {
    const old = makeCapture('old', 20 * DAY_MS)
    expect(computeWeeklyTrend([old], NOW)).toBeNull()
  })

  it('thisWeek=8 lastWeek=6 → direction up, deltaPercent=33', () => {
    const captures = [...thisWeekCaptures(8), ...lastWeekCaptures(6)]
    const trend = computeWeeklyTrend(captures, NOW)
    expect(trend).not.toBeNull()
    expect(trend!.thisWeek).toBe(8)
    expect(trend!.lastWeek).toBe(6)
    expect(trend!.direction).toBe('up')
    expect(trend!.deltaPercent).toBe(33) // (8-6)/6*100 = 33.33… → rounds to 33
  })

  it('thisWeek=5 lastWeek=10 → direction down, deltaPercent=-50', () => {
    const captures = [...thisWeekCaptures(5), ...lastWeekCaptures(10)]
    const trend = computeWeeklyTrend(captures, NOW)
    expect(trend).not.toBeNull()
    expect(trend!.thisWeek).toBe(5)
    expect(trend!.lastWeek).toBe(10)
    expect(trend!.direction).toBe('down')
    expect(trend!.deltaPercent).toBe(-50)
  })

  it('thisWeek=5 lastWeek=5 → direction flat, deltaPercent=0', () => {
    const captures = [...thisWeekCaptures(5), ...lastWeekCaptures(5)]
    const trend = computeWeeklyTrend(captures, NOW)
    expect(trend).not.toBeNull()
    expect(trend!.thisWeek).toBe(5)
    expect(trend!.lastWeek).toBe(5)
    expect(trend!.direction).toBe('flat')
    expect(trend!.deltaPercent).toBe(0)
  })

  it('thisWeek=3 lastWeek=0 → direction new', () => {
    const captures = thisWeekCaptures(3)
    const trend = computeWeeklyTrend(captures, NOW)
    expect(trend).not.toBeNull()
    expect(trend!.thisWeek).toBe(3)
    expect(trend!.lastWeek).toBe(0)
    expect(trend!.direction).toBe('new')
  })

  it('thisWeek=0 lastWeek=0 → returns null', () => {
    expect(computeWeeklyTrend([], NOW)).toBeNull()
  })

  it('boundary: capture at exactly 7*DAY_MS age is counted as lastWeek (not thisWeek)', () => {
    const exactBoundary = makeCapture('boundary', 7 * DAY_MS)
    const trend = computeWeeklyTrend([exactBoundary], NOW)
    // age >= 7*DAY_MS → falls into lastWeek bucket
    // thisWeek=0, lastWeek=1 → (0-1)/1*100 = -100 → direction 'down'
    expect(trend).not.toBeNull()
    expect(trend!.thisWeek).toBe(0)
    expect(trend!.lastWeek).toBe(1)
    expect(trend!.direction).toBe('down')
    expect(trend!.deltaPercent).toBe(-100)
  })

  it('boundary: capture just under 7*DAY_MS age is counted as thisWeek', () => {
    const justBelow = makeCapture('just-below', 7 * DAY_MS - 1)
    const trend = computeWeeklyTrend([justBelow], NOW)
    expect(trend).not.toBeNull()
    expect(trend!.thisWeek).toBe(1)
    expect(trend!.lastWeek).toBe(0)
    expect(trend!.direction).toBe('new')
  })

  it('ignores future captures (negative age)', () => {
    const future = makeCapture('future', -1 * DAY_MS) // created 1 day in the future
    expect(computeWeeklyTrend([future], NOW)).toBeNull()
  })

  it('uses current date when now parameter is omitted (smoke test — returns WeeklyTrend or null)', () => {
    const result = computeWeeklyTrend([])
    expect(result).toBeNull()
  })

  it('default now: a fresh capture should land in thisWeek', () => {
    const recentCapture: Capture = {
      id: 'r1',
      body: 'recent',
      context: 'test',
      createdAt: Date.now() - 1000, // 1 second ago
    }
    const trend = computeWeeklyTrend([recentCapture])
    expect(trend).not.toBeNull()
    expect(trend!.thisWeek).toBe(1)
    expect(trend!.lastWeek).toBe(0)
    expect(trend!.direction).toBe('new')
  })
})

// ---------------------------------------------------------------------------
// trendLabel
// ---------------------------------------------------------------------------

describe('trendLabel', () => {
  it('formats direction=new as "↑ NEW"', () => {
    expect(trendLabel({ thisWeek: 3, lastWeek: 0, deltaPercent: 0, direction: 'new' })).toBe('↑ NEW')
  })

  it('formats direction=up with positive percentage', () => {
    expect(trendLabel({ thisWeek: 8, lastWeek: 6, deltaPercent: 33, direction: 'up' })).toBe('↑ 33%')
  })

  it('formats direction=down with absolute percentage (no leading minus)', () => {
    expect(trendLabel({ thisWeek: 5, lastWeek: 10, deltaPercent: -50, direction: 'down' })).toBe('↓ 50%')
  })

  it('formats direction=flat as "─ 0%"', () => {
    expect(trendLabel({ thisWeek: 5, lastWeek: 5, deltaPercent: 0, direction: 'flat' })).toBe('─ 0%')
  })

  it('trendLabel up: large delta formats correctly', () => {
    expect(trendLabel({ thisWeek: 20, lastWeek: 1, deltaPercent: 1900, direction: 'up' })).toBe('↑ 1900%')
  })

  it('trendLabel down: delta=-100 formats as "↓ 100%"', () => {
    expect(trendLabel({ thisWeek: 0, lastWeek: 5, deltaPercent: -100, direction: 'down' })).toBe('↓ 100%')
  })
})
