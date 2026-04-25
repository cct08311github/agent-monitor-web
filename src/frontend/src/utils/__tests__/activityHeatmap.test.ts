import { describe, it, expect } from 'vitest'
import {
  dateKey,
  bucketByDay,
  intensityBucket,
  buildGrid,
} from '../activityHeatmap'

// ---------------------------------------------------------------------------
// dateKey
// ---------------------------------------------------------------------------

describe('dateKey', () => {
  it('produces YYYY-MM-DD from a mid-month Date', () => {
    expect(dateKey(new Date(2026, 3, 26))).toBe('2026-04-26') // April = month 3
  })

  it('zero-pads month and day', () => {
    expect(dateKey(new Date(2025, 0, 5))).toBe('2025-01-05')
  })

  it('handles end-of-year date', () => {
    expect(dateKey(new Date(2025, 11, 31))).toBe('2025-12-31')
  })

  it('uses local timezone, not UTC', () => {
    // Midnight local should be the local date, not necessarily UTC date
    const d = new Date(2026, 3, 26, 0, 0, 0, 0)
    expect(dateKey(d)).toBe('2026-04-26')
  })
})

// ---------------------------------------------------------------------------
// bucketByDay
// ---------------------------------------------------------------------------

describe('bucketByDay', () => {
  it('returns an empty map for empty input', () => {
    const result = bucketByDay([])
    expect(result.size).toBe(0)
  })

  it('aggregates same-day items correctly', () => {
    const day = new Date(2026, 3, 26) // 2026-04-26
    const items = [
      { createdAt: new Date(2026, 3, 26, 9, 0) },
      { createdAt: new Date(2026, 3, 26, 14, 30) },
      { createdAt: new Date(2026, 3, 26, 23, 59) },
    ]
    const result = bucketByDay(items)
    expect(result.get('2026-04-26')).toBe(3)
    void day
  })

  it('keeps different days separate', () => {
    const items = [
      { createdAt: new Date(2026, 3, 25, 12, 0) },
      { createdAt: new Date(2026, 3, 26, 12, 0) },
    ]
    const result = bucketByDay(items)
    expect(result.get('2026-04-25')).toBe(1)
    expect(result.get('2026-04-26')).toBe(1)
    expect(result.size).toBe(2)
  })

  it('accepts createdAt as a number (epoch ms)', () => {
    const ts = new Date(2026, 3, 26, 10, 0).getTime()
    const result = bucketByDay([{ createdAt: ts }])
    expect(result.get('2026-04-26')).toBe(1)
  })

  it('accepts createdAt as a string ISO date', () => {
    const d = new Date(2026, 3, 26, 10, 0)
    const iso = d.toISOString()
    const result = bucketByDay([{ createdAt: iso }])
    // The date in local timezone could differ from UTC date; just verify non-zero
    expect(result.size).toBe(1)
    expect([...result.values()][0]).toBe(1)
  })

  it('accepts createdAt as a Date object', () => {
    const result = bucketByDay([{ createdAt: new Date(2026, 3, 26, 8, 0) }])
    expect(result.get('2026-04-26')).toBe(1)
  })

  it('skips invalid createdAt values gracefully', () => {
    const result = bucketByDay([{ createdAt: 'not-a-date' }])
    expect(result.size).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// intensityBucket
// ---------------------------------------------------------------------------

describe('intensityBucket', () => {
  it('maps 0 → 0', () => expect(intensityBucket(0)).toBe(0))
  it('maps negative → 0', () => expect(intensityBucket(-5)).toBe(0))
  it('maps 1 → 1', () => expect(intensityBucket(1)).toBe(1))
  it('maps 2 → 1', () => expect(intensityBucket(2)).toBe(1))
  it('maps 3 → 2', () => expect(intensityBucket(3)).toBe(2))
  it('maps 5 → 2', () => expect(intensityBucket(5)).toBe(2))
  it('maps 6 → 3', () => expect(intensityBucket(6)).toBe(3))
  it('maps 10 → 3', () => expect(intensityBucket(10)).toBe(3))
  it('maps 11 → 4', () => expect(intensityBucket(11)).toBe(4))
  it('maps 100 → 4', () => expect(intensityBucket(100)).toBe(4))
})

// ---------------------------------------------------------------------------
// buildGrid
// ---------------------------------------------------------------------------

describe('buildGrid', () => {
  it('returns exactly weeks × 7 = 49 cells for weeks=7', () => {
    const today = new Date(2026, 3, 26) // Sunday
    const grid = buildGrid(today, 7)
    expect(grid.length).toBe(7)
    for (const col of grid) {
      expect(col.length).toBe(7)
    }
  })

  it('last cell key matches today\'s dateKey when today is Saturday', () => {
    // 2026-04-25 is a Saturday
    const today = new Date(2026, 3, 25)
    const todayStr = dateKey(today)
    const grid = buildGrid(today, 7)
    const lastCol = grid[grid.length - 1]
    const lastCell = lastCol[today.getDay()] // Saturday = row 6
    expect(lastCell.key).toBe(todayStr)
  })

  it('last cell key matches today\'s dateKey when today is Sunday', () => {
    // 2026-04-26 is a Sunday
    const today = new Date(2026, 3, 26)
    const todayStr = dateKey(today)
    const grid = buildGrid(today, 7)
    const lastCol = grid[grid.length - 1]
    const lastCell = lastCol[0] // Sunday = row 0
    expect(lastCell.key).toBe(todayStr)
  })

  it('cells beyond today have inRange === false', () => {
    // Use a Wednesday so Sat of the same week is in the future
    const today = new Date(2026, 3, 22) // Wednesday, April 22 2026
    const grid = buildGrid(today, 7)
    const lastCol = grid[grid.length - 1]
    // Thu, Fri, Sat rows (3, 4, 5, 6) should be inRange=false
    for (let row = today.getDay() + 1; row < 7; row++) {
      expect(lastCol[row].inRange).toBe(false)
    }
  })

  it('all past cells have inRange === true', () => {
    const today = new Date(2026, 3, 26) // Sunday
    const grid = buildGrid(today, 7)
    let pastCells = 0
    let inRangeCount = 0
    for (const col of grid) {
      for (const cell of col) {
        if (cell.key < dateKey(today)) {
          pastCells++
          if (cell.inRange) inRangeCount++
        }
      }
    }
    expect(inRangeCount).toBe(pastCells)
  })

  it('correctly spans across a month boundary', () => {
    // today = 2026-04-05 (Sunday).
    // col 0 = Feb 21–27, col 1 = Feb 28 – Mar 6 (crosses Feb/March boundary).
    const today = new Date(2026, 3, 5) // April 5
    const grid = buildGrid(today, 7)
    // At least one of the grid cells should be in March 2026
    const allKeys = grid.flatMap((col) => col.map((cell) => cell.key))
    const hasMarch = allKeys.some((k) => k.startsWith('2026-03'))
    expect(hasMarch).toBe(true)
    // And the grid should also contain cells from April
    const hasApril = allKeys.some((k) => k.startsWith('2026-04'))
    expect(hasApril).toBe(true)
  })

  it('grid cell days of week match their actual Date.getDay()', () => {
    const today = new Date(2026, 3, 26)
    const grid = buildGrid(today, 7)
    for (const col of grid) {
      for (const cell of col) {
        // dayOfWeek stored on cell should equal Date.getDay() of cell.date
        expect(cell.date.getDay()).toBe(cell.dayOfWeek)
      }
    }
  })
})
