import { describe, it, expect } from 'vitest'
import { bucketCapturesByDay, buildCaptureGrid } from '../captureHeatmap'
import { dateKey } from '../activityHeatmap'
import type { Capture } from '../quickCapture'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCapture(createdAt: number, id = `c_${createdAt}`): Capture {
  return { id, body: 'test', context: 'test', createdAt }
}

function dateAt(y: number, m: number, d: number, h = 12): number {
  return new Date(y, m - 1, d, h, 0, 0, 0).getTime()
}

// ---------------------------------------------------------------------------
// bucketCapturesByDay
// ---------------------------------------------------------------------------

describe('bucketCapturesByDay', () => {
  it('aggregates same-day captures into one entry', () => {
    const today = new Date(2024, 5, 15, 9, 0, 0)   // 2024-06-15 09:00
    const later = new Date(2024, 5, 15, 20, 0, 0)  // 2024-06-15 20:00
    const captures: Capture[] = [
      makeCapture(today.getTime(), 'a'),
      makeCapture(later.getTime(), 'b'),
    ]

    const map = bucketCapturesByDay(captures)
    expect(map.get('2024-06-15')).toBe(2)
    expect(map.size).toBe(1)
  })

  it('returns an empty Map for empty input', () => {
    const map = bucketCapturesByDay([])
    expect(map.size).toBe(0)
  })

  it('separates captures on different days', () => {
    const captures: Capture[] = [
      makeCapture(dateAt(2024, 6, 1), 'a'),
      makeCapture(dateAt(2024, 6, 2), 'b'),
      makeCapture(dateAt(2024, 6, 2), 'c'),
    ]

    const map = bucketCapturesByDay(captures)
    expect(map.get('2024-06-01')).toBe(1)
    expect(map.get('2024-06-02')).toBe(2)
    expect(map.size).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// buildCaptureGrid
// ---------------------------------------------------------------------------

describe('buildCaptureGrid', () => {
  it('returns exactly `days` cells when called with days=30', () => {
    const today = new Date(2024, 5, 15)
    const cells = buildCaptureGrid(today, 30)
    expect(cells).toHaveLength(30)
  })

  it('last cell key equals today\'s date', () => {
    const today = new Date(2024, 5, 15)
    const cells = buildCaptureGrid(today, 30)
    const last = cells[cells.length - 1]!
    expect(last.key).toBe(dateKey(today))
  })

  it('returns exactly 1 cell when days=1', () => {
    const today = new Date(2024, 5, 15)
    const cells = buildCaptureGrid(today, 1)
    expect(cells).toHaveLength(1)
    expect(cells[0]!.key).toBe(dateKey(today))
  })

  it('all cells are marked inRange: true', () => {
    const today = new Date(2024, 0, 20)
    const cells = buildCaptureGrid(today, 30)
    for (const cell of cells) {
      expect(cell.inRange).toBe(true)
    }
  })

  it('spans across a month boundary correctly', () => {
    // today = 2024-03-05; 30 days back = 2024-02-05
    const today = new Date(2024, 2, 5)  // March 5, 2024
    const cells = buildCaptureGrid(today, 30)

    expect(cells).toHaveLength(30)

    const first = cells[0]!
    expect(first.key).toBe('2024-02-05')

    const last = cells[cells.length - 1]!
    expect(last.key).toBe('2024-03-05')
  })

  it('cells are ordered oldest-first with consecutive days', () => {
    const today = new Date(2024, 5, 15)
    const cells = buildCaptureGrid(today, 7)

    for (let i = 1; i < cells.length; i++) {
      const prev = cells[i - 1]!.date.getTime()
      const curr = cells[i]!.date.getTime()
      // Each cell should be exactly 1 day (86400000 ms) after the previous
      expect(curr - prev).toBe(86400000)
    }
  })
})
