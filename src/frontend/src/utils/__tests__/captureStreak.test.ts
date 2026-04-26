import { describe, it, expect } from 'vitest'
import { computeStreak } from '../captureStreak'
import type { Capture } from '../quickCapture'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let idCounter = 0

function makeCapture(isoDate: string): Capture {
  const ts = new Date(isoDate).getTime()
  return { id: String(++idCounter), body: 'test', context: 'test', createdAt: ts }
}

/** Build a fixed "now" Date at the start of the given local day. */
function noon(isoDate: string): Date {
  // Use local time noon to avoid DST edge cases
  const [y, m, d] = isoDate.split('-').map(Number)
  return new Date(y, m - 1, d, 12, 0, 0, 0)
}

// ---------------------------------------------------------------------------
// computeStreak
// ---------------------------------------------------------------------------

describe('computeStreak — empty captures', () => {
  it('returns {current: 0, best: 0, activeToday: false}', () => {
    expect(computeStreak([], noon('2025-04-20'))).toEqual({
      current: 0,
      best: 0,
      activeToday: false,
    })
  })
})

describe('computeStreak — single day', () => {
  it('capture today only → current 1, best 1, activeToday true', () => {
    const now = noon('2025-04-20')
    const caps = [makeCapture('2025-04-20T10:00:00')]
    const result = computeStreak(caps, now)
    expect(result).toEqual({ current: 1, best: 1, activeToday: true })
  })

  it('capture only yesterday → current 1, best 1, activeToday false', () => {
    const now = noon('2025-04-20')
    const caps = [makeCapture('2025-04-19T10:00:00')]
    const result = computeStreak(caps, now)
    expect(result).toEqual({ current: 1, best: 1, activeToday: false })
  })
})

describe('computeStreak — consecutive days', () => {
  it('today + yesterday → current 2, best 2', () => {
    const now = noon('2025-04-20')
    const caps = [makeCapture('2025-04-20T08:00:00'), makeCapture('2025-04-19T08:00:00')]
    const result = computeStreak(caps, now)
    expect(result).toEqual({ current: 2, best: 2, activeToday: true })
  })

  it('today + yesterday + day before → current 3, best 3', () => {
    const now = noon('2025-04-20')
    const caps = [
      makeCapture('2025-04-20T08:00:00'),
      makeCapture('2025-04-19T08:00:00'),
      makeCapture('2025-04-18T08:00:00'),
    ]
    const result = computeStreak(caps, now)
    expect(result).toEqual({ current: 3, best: 3, activeToday: true })
  })
})

describe('computeStreak — gap breaks current but not best', () => {
  it('no capture today and yesterday → current 0', () => {
    const now = noon('2025-04-20')
    // Only 3 days ago
    const caps = [makeCapture('2025-04-17T08:00:00')]
    const result = computeStreak(caps, now)
    expect(result.current).toBe(0)
    expect(result.activeToday).toBe(false)
  })

  it('older streak preserved in best even after gap', () => {
    const now = noon('2025-04-20')
    const caps = [
      // 5-day streak last month
      makeCapture('2025-03-10T08:00:00'),
      makeCapture('2025-03-11T08:00:00'),
      makeCapture('2025-03-12T08:00:00'),
      makeCapture('2025-03-13T08:00:00'),
      makeCapture('2025-03-14T08:00:00'),
      // Only today
      makeCapture('2025-04-20T08:00:00'),
    ]
    const result = computeStreak(caps, now)
    expect(result.best).toBe(5)
    expect(result.current).toBe(1) // only today, no yesterday
    expect(result.activeToday).toBe(true)
  })
})

describe('computeStreak — same-day multiple captures count as one day', () => {
  it('three captures today still count as streak of 1', () => {
    const now = noon('2025-04-20')
    const caps = [
      makeCapture('2025-04-20T07:00:00'),
      makeCapture('2025-04-20T12:00:00'),
      makeCapture('2025-04-20T23:00:00'),
    ]
    const result = computeStreak(caps, now)
    expect(result.current).toBe(1)
    expect(result.best).toBe(1)
  })

  it('multiple captures on consecutive days still compute streak correctly', () => {
    const now = noon('2025-04-20')
    const caps = [
      makeCapture('2025-04-20T07:00:00'),
      makeCapture('2025-04-20T22:00:00'),
      makeCapture('2025-04-19T09:00:00'),
      makeCapture('2025-04-19T18:00:00'),
    ]
    const result = computeStreak(caps, now)
    expect(result.current).toBe(2)
    expect(result.best).toBe(2)
  })
})

describe('computeStreak — cross-month boundary', () => {
  it('Apr 30 and May 1 form a 2-day streak', () => {
    const now = noon('2025-05-01')
    const caps = [makeCapture('2025-04-30T10:00:00'), makeCapture('2025-05-01T10:00:00')]
    const result = computeStreak(caps, now)
    expect(result.current).toBe(2)
    expect(result.best).toBe(2)
    expect(result.activeToday).toBe(true)
  })
})

describe('computeStreak — edge of day (23:59 vs 00:01)', () => {
  it('capture at 23:59 on day A and 00:01 on day B both count', () => {
    const now = noon('2025-04-20')
    // 23:59 on Apr 19 and 00:01 on Apr 20
    const caps = [
      makeCapture('2025-04-19T23:59:00'),
      makeCapture('2025-04-20T00:01:00'),
    ]
    const result = computeStreak(caps, now)
    expect(result.current).toBe(2)
    expect(result.best).toBe(2)
    expect(result.activeToday).toBe(true)
  })
})

describe('computeStreak — best independently calculated', () => {
  it('best reflects the longest run, current may be shorter', () => {
    const now = noon('2025-04-20')
    const caps = [
      // 4-day run in Feb
      makeCapture('2025-02-10T08:00:00'),
      makeCapture('2025-02-11T08:00:00'),
      makeCapture('2025-02-12T08:00:00'),
      makeCapture('2025-02-13T08:00:00'),
      // 2-day run now
      makeCapture('2025-04-19T08:00:00'),
      makeCapture('2025-04-20T08:00:00'),
    ]
    const result = computeStreak(caps, now)
    expect(result.best).toBe(4)
    expect(result.current).toBe(2)
  })
})
