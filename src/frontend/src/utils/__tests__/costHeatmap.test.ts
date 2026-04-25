import { describe, it, expect } from 'vitest'
import {
  computeHeatmapBuckets,
  maxBucketCost,
  colorForCost,
  type CostPoint,
  type HeatmapBucket,
} from '../costHeatmap'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePoint(ts: Date, cost: number): CostPoint {
  return { ts: ts.toISOString(), total_cost: cost }
}

/** Build a Date that is `offsetDays` days before now, on the given `hour`. */
function recentDate(offsetDays: number, hour: number, minute = 0): Date {
  const d = new Date()
  d.setDate(d.getDate() - offsetDays)
  d.setHours(hour, minute, 0, 0)
  return d
}

// ---------------------------------------------------------------------------
// computeHeatmapBuckets
// ---------------------------------------------------------------------------

describe('computeHeatmapBuckets', () => {
  it('returns a 7×24 matrix of zeroed buckets for empty input', () => {
    const matrix = computeHeatmapBuckets([])
    expect(matrix).toHaveLength(7)
    for (let dow = 0; dow < 7; dow++) {
      expect(matrix[dow]).toHaveLength(24)
      for (let hr = 0; hr < 24; hr++) {
        expect(matrix[dow][hr]).toEqual<HeatmapBucket>({ dayOfWeek: dow, hour: hr, cost: 0 })
      }
    }
  })

  it('accumulates a single cost point into the correct (dayOfWeek, hour) bucket', () => {
    const date = recentDate(1, 14) // yesterday, 14:xx
    const dow = date.getDay()
    const matrix = computeHeatmapBuckets([makePoint(date, 0.05)])
    expect(matrix[dow][14].cost).toBeCloseTo(0.05)
    // All other cells remain zero
    for (let d = 0; d < 7; d++) {
      for (let h = 0; h < 24; h++) {
        if (d === dow && h === 14) continue
        expect(matrix[d][h].cost).toBe(0)
      }
    }
  })

  it('accumulates multiple points with the same (dayOfWeek, hour)', () => {
    const date = recentDate(0, 10)
    const dow = date.getDay()
    const points = [
      makePoint(date, 0.10),
      makePoint(date, 0.20),
      makePoint(date, 0.30),
    ]
    const matrix = computeHeatmapBuckets(points)
    expect(matrix[dow][10].cost).toBeCloseTo(0.60)
  })

  it('correctly assigns Sunday (dow=0) and Saturday (dow=6) boundary days', () => {
    // Find the most recent Sunday and Saturday within last 7 days
    const now = new Date()

    // walk back to find Sunday (day 0)
    let sunday: Date | null = null
    let saturday: Date | null = null
    for (let i = 0; i < 7; i++) {
      const d = recentDate(i, 8)
      if (d.getDay() === 0 && sunday === null) sunday = d
      if (d.getDay() === 6 && saturday === null) saturday = d
    }

    const points: CostPoint[] = []
    if (sunday) points.push(makePoint(sunday, 1.0))
    if (saturday) points.push(makePoint(saturday, 2.0))

    const matrix = computeHeatmapBuckets(points)
    if (sunday) expect(matrix[0][8].cost).toBeCloseTo(1.0)
    if (saturday) expect(matrix[6][8].cost).toBeCloseTo(2.0)

    // Silence unused-variable warning if now is unused
    void now
  })

  it('ignores data points older than 7 days', () => {
    const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) // 8 days ago
    const matrix = computeHeatmapBuckets([makePoint(old, 9.99)])
    for (const row of matrix) {
      for (const cell of row) {
        expect(cell.cost).toBe(0)
      }
    }
  })

  it('ignores entries with invalid ISO timestamps', () => {
    const points: CostPoint[] = [{ ts: 'not-a-date', total_cost: 5 }]
    const matrix = computeHeatmapBuckets(points)
    for (const row of matrix) {
      for (const cell of row) {
        expect(cell.cost).toBe(0)
      }
    }
  })

  it('accumulates costs from multiple days and hours independently', () => {
    const d0 = recentDate(0, 9)
    const d1 = recentDate(1, 15)
    const dow0 = d0.getDay()
    const dow1 = d1.getDay()

    const matrix = computeHeatmapBuckets([
      makePoint(d0, 0.10),
      makePoint(d1, 0.40),
    ])
    expect(matrix[dow0][9].cost).toBeCloseTo(0.10)
    expect(matrix[dow1][15].cost).toBeCloseTo(0.40)
  })

  it('bucket metadata (dayOfWeek, hour) matches matrix coordinates', () => {
    const matrix = computeHeatmapBuckets([])
    for (let dow = 0; dow < 7; dow++) {
      for (let hr = 0; hr < 24; hr++) {
        expect(matrix[dow][hr].dayOfWeek).toBe(dow)
        expect(matrix[dow][hr].hour).toBe(hr)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// maxBucketCost
// ---------------------------------------------------------------------------

describe('maxBucketCost', () => {
  it('returns 0 for an all-zero matrix', () => {
    const matrix = computeHeatmapBuckets([])
    expect(maxBucketCost(matrix)).toBe(0)
  })

  it('returns the correct maximum from a sparse matrix', () => {
    const date = recentDate(0, 12)
    const dow = date.getDay()
    const points = [makePoint(date, 0.5), makePoint(recentDate(1, 6), 1.2)]
    const matrix = computeHeatmapBuckets(points)
    void dow
    expect(maxBucketCost(matrix)).toBeCloseTo(1.2)
  })

  it('returns exact value when a single cell is populated', () => {
    const date = recentDate(0, 3)
    const dow = date.getDay()
    const matrix = computeHeatmapBuckets([makePoint(date, 0.07)])
    void dow
    expect(maxBucketCost(matrix)).toBeCloseTo(0.07)
  })
})

// ---------------------------------------------------------------------------
// colorForCost
// ---------------------------------------------------------------------------

describe('colorForCost', () => {
  it('returns transparent when max is 0', () => {
    expect(colorForCost(0, 0)).toBe('transparent')
    expect(colorForCost(5, 0)).toBe('transparent')
  })

  it('returns transparent when cost is 0', () => {
    expect(colorForCost(0, 10)).toBe('transparent')
  })

  it('returns #fee5d9 for cost in (0, 0.25×max]', () => {
    expect(colorForCost(0.25, 1)).toBe('#fee5d9')   // exactly 0.25
    expect(colorForCost(0.01, 1)).toBe('#fee5d9')   // near zero
    expect(colorForCost(1, 4)).toBe('#fee5d9')      // 1/4 = 0.25
  })

  it('returns #fcae91 for cost in (0.25, 0.50×max]', () => {
    expect(colorForCost(0.26, 1)).toBe('#fcae91')
    expect(colorForCost(0.5, 1)).toBe('#fcae91')    // exactly 0.50
    expect(colorForCost(2, 4)).toBe('#fcae91')      // 2/4 = 0.50
  })

  it('returns #fb6a4a for cost in (0.50, 0.75×max]', () => {
    expect(colorForCost(0.51, 1)).toBe('#fb6a4a')
    expect(colorForCost(0.75, 1)).toBe('#fb6a4a')   // exactly 0.75
    expect(colorForCost(3, 4)).toBe('#fb6a4a')      // 3/4 = 0.75
  })

  it('returns #cb181d for cost in (0.75, max]', () => {
    expect(colorForCost(0.76, 1)).toBe('#cb181d')
    expect(colorForCost(1, 1)).toBe('#cb181d')      // exactly max
    expect(colorForCost(4, 4)).toBe('#cb181d')      // full max
  })
})
