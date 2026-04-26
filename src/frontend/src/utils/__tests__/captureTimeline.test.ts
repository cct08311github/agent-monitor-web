import { describe, it, expect } from 'vitest'
import { dayLabel, groupByDay } from '../captureTimeline'
import type { Capture } from '../quickCapture'

// Fixed "now" for deterministic tests: 2026-04-26 (Sunday) at noon local time
const NOW = new Date(2026, 3, 26, 12, 0, 0) // month is 0-indexed

function makeCapture(id: string, createdAt: number): Capture {
  return { id, body: `capture ${id}`, context: 'test', createdAt }
}

function ts(year: number, month: number, day: number, hour = 10): number {
  return new Date(year, month - 1, day, hour, 0, 0).getTime()
}

// ── dayLabel ─────────────────────────────────────────────────────────────────

describe('dayLabel', () => {
  it('returns 今天 for a capture created today', () => {
    const today = new Date(2026, 3, 26, 9, 30, 0)
    expect(dayLabel(today, NOW)).toBe('今天')
  })

  it('returns 昨天 for a capture created yesterday', () => {
    const yesterday = new Date(2026, 3, 25, 14, 0, 0)
    expect(dayLabel(yesterday, NOW)).toBe('昨天')
  })

  it('returns N 天前 for 5 days ago', () => {
    const fiveDaysAgo = new Date(2026, 3, 21, 8, 0, 0)
    expect(dayLabel(fiveDaysAgo, NOW)).toBe('5 天前')
  })

  it('returns N 天前 for 2 days ago', () => {
    const twoDaysAgo = new Date(2026, 3, 24, 10, 0, 0)
    expect(dayLabel(twoDaysAgo, NOW)).toBe('2 天前')
  })

  it('returns N 天前 for 6 days ago (boundary — still within 7)', () => {
    const sixDaysAgo = new Date(2026, 3, 20, 10, 0, 0)
    expect(dayLabel(sixDaysAgo, NOW)).toBe('6 天前')
  })

  it('returns YYYY-MM-DD (週X) format for 8 days ago', () => {
    // 2026-04-26 - 8 days = 2026-04-18 (Saturday = 六)
    const eightDaysAgo = new Date(2026, 3, 18, 10, 0, 0)
    expect(dayLabel(eightDaysAgo, NOW)).toBe('2026-04-18 (週六)')
  })

  it('returns YYYY-MM-DD (週X) format for exactly 7 days ago', () => {
    // 2026-04-26 - 7 = 2026-04-19 (Sunday = 日)
    const sevenDaysAgo = new Date(2026, 3, 19, 10, 0, 0)
    expect(dayLabel(sevenDaysAgo, NOW)).toBe('2026-04-19 (週日)')
  })

  it('returns YYYY-MM-DD (週X) format for a future date', () => {
    const future = new Date(2026, 4, 1, 10, 0, 0) // 2026-05-01 (Friday = 五)
    expect(dayLabel(future, NOW)).toBe('2026-05-01 (週五)')
  })
})

// ── groupByDay ────────────────────────────────────────────────────────────────

describe('groupByDay', () => {
  it('returns empty array for empty input', () => {
    expect(groupByDay([], NOW)).toEqual([])
  })

  it('groups same-day captures into a single group', () => {
    const captures: Capture[] = [
      makeCapture('a', ts(2026, 4, 25, 9)),
      makeCapture('b', ts(2026, 4, 25, 14)),
      makeCapture('c', ts(2026, 4, 25, 18)),
    ]
    const groups = groupByDay(captures, NOW)
    expect(groups).toHaveLength(1)
    expect(groups[0].dateKey).toBe('2026-04-25')
    expect(groups[0].captures).toHaveLength(3)
  })

  it('orders groups newest-first', () => {
    const captures: Capture[] = [
      makeCapture('old', ts(2026, 4, 20, 10)),
      makeCapture('new', ts(2026, 4, 25, 10)),
      makeCapture('mid', ts(2026, 4, 22, 10)),
    ]
    const groups = groupByDay(captures, NOW)
    expect(groups[0].dateKey).toBe('2026-04-25')
    expect(groups[1].dateKey).toBe('2026-04-22')
    expect(groups[2].dateKey).toBe('2026-04-20')
  })

  it('assigns correct label to each group', () => {
    const captures: Capture[] = [
      makeCapture('today', ts(2026, 4, 26, 10)),
      makeCapture('yest', ts(2026, 4, 25, 10)),
    ]
    const groups = groupByDay(captures, NOW)
    expect(groups[0].label).toBe('今天')
    expect(groups[1].label).toBe('昨天')
  })

  it('handles cross-month boundary correctly', () => {
    const captures: Capture[] = [
      makeCapture('march', ts(2026, 3, 31, 10)),
      makeCapture('april', ts(2026, 4, 1, 10)),
    ]
    const groups = groupByDay(captures, NOW)
    expect(groups).toHaveLength(2)
    // April group is newer → appears first
    expect(groups[0].dateKey).toBe('2026-04-01')
    expect(groups[1].dateKey).toBe('2026-03-31')
  })

  it('handles cross-year boundary correctly', () => {
    const captures: Capture[] = [
      makeCapture('ny', ts(2026, 1, 1, 0)),
      makeCapture('eve', ts(2025, 12, 31, 23)),
    ]
    const groups = groupByDay(captures, NOW)
    expect(groups).toHaveLength(2)
    expect(groups[0].dateKey).toBe('2026-01-01')
    expect(groups[1].dateKey).toBe('2025-12-31')
  })

  it('preserves capture order within each group', () => {
    const captures: Capture[] = [
      makeCapture('first', ts(2026, 4, 26, 8)),
      makeCapture('second', ts(2026, 4, 26, 12)),
      makeCapture('third', ts(2026, 4, 26, 17)),
    ]
    const groups = groupByDay(captures, NOW)
    expect(groups[0].captures.map((c) => c.id)).toEqual(['first', 'second', 'third'])
  })

  it('handles a single capture correctly', () => {
    const captures: Capture[] = [makeCapture('solo', ts(2026, 4, 10, 10))]
    const groups = groupByDay(captures, NOW)
    expect(groups).toHaveLength(1)
    expect(groups[0].captures[0].id).toBe('solo')
  })
})
