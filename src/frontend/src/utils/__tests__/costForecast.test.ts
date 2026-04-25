import { describe, it, expect } from 'vitest'
import {
  aggregateDaily,
  linearRegression,
  buildForecast,
  type CostPoint,
  type DailyCost,
} from '../costForecast'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a CostPoint with local-date ISO string at midnight. */
function makePoint(offsetDays: number, cost: number, hour = 10): CostPoint {
  const d = new Date()
  d.setDate(d.getDate() - offsetDays)
  d.setHours(hour, 0, 0, 0)
  d.setMilliseconds(0)
  return { ts: d.toISOString(), total_cost: cost }
}

/** Build multiple points on the same local day. */
function makeMinutePoints(offsetDays: number, costs: number[]): CostPoint[] {
  return costs.map((cost, i) => {
    const d = new Date()
    d.setDate(d.getDate() - offsetDays)
    d.setHours(9, i, 0, 0)
    return { ts: d.toISOString(), total_cost: cost }
  })
}

/** Local YYYY-MM-DD string for today minus offsetDays. */
function localDate(offsetDays: number): string {
  const d = new Date()
  d.setDate(d.getDate() - offsetDays)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// ---------------------------------------------------------------------------
// aggregateDaily
// ---------------------------------------------------------------------------

describe('aggregateDaily', () => {
  it('returns empty array for empty input', () => {
    expect(aggregateDaily([])).toEqual([])
  })

  it('merges multiple minute-level points on the same day', () => {
    const points = makeMinutePoints(0, [0.10, 0.20, 0.30])
    const daily = aggregateDaily(points)
    expect(daily).toHaveLength(1)
    expect(daily[0].date).toBe(localDate(0))
    expect(daily[0].cost).toBeCloseTo(0.60)
  })

  it('produces one entry per day when points span different days', () => {
    const points = [
      makePoint(2, 1.0),
      makePoint(1, 2.0),
      makePoint(0, 3.0),
    ]
    const daily = aggregateDaily(points)
    expect(daily).toHaveLength(3)
    // sorted ascending by date
    expect(daily[0].cost).toBeCloseTo(1.0)
    expect(daily[1].cost).toBeCloseTo(2.0)
    expect(daily[2].cost).toBeCloseTo(3.0)
  })

  it('sorts results ascending by date', () => {
    const points = [makePoint(0, 5), makePoint(5, 1), makePoint(2, 3)]
    const daily = aggregateDaily(points)
    const dates = daily.map((d: DailyCost) => d.date)
    expect(dates).toEqual([...dates].sort())
  })

  it('limits results to last 14 days (ignores older data)', () => {
    // 15 days ago should be excluded
    const oldDate = new Date()
    oldDate.setDate(oldDate.getDate() - 15)
    const oldPoint: CostPoint = { ts: oldDate.toISOString(), total_cost: 999 }
    const recentPoints = [makePoint(0, 1), makePoint(7, 1)]
    const daily = aggregateDaily([oldPoint, ...recentPoints])
    const dateStrings = daily.map((d: DailyCost) => d.date)
    const cutoff = (() => {
      const c = new Date()
      c.setDate(c.getDate() - 13)
      const y = c.getFullYear()
      const m = String(c.getMonth() + 1).padStart(2, '0')
      const day = String(c.getDate()).padStart(2, '0')
      return `${y}-${m}-${day}`
    })()
    for (const date of dateStrings) {
      expect(date >= cutoff).toBe(true)
    }
    // oldPoint cost should not appear
    expect(daily.find((d: DailyCost) => d.cost === 999)).toBeUndefined()
  })

  it('ignores entries with invalid timestamps', () => {
    const points: CostPoint[] = [
      { ts: 'not-a-date', total_cost: 100 },
      makePoint(0, 5),
    ]
    const daily = aggregateDaily(points)
    expect(daily.every((d: DailyCost) => d.cost < 100)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// linearRegression
// ---------------------------------------------------------------------------

describe('linearRegression', () => {
  it('returns slope=0, intercept=0, rSquared=0 for empty array', () => {
    const result = linearRegression([])
    expect(result.slope).toBe(0)
    expect(result.intercept).toBe(0)
    expect(result.rSquared).toBe(0)
  })

  it('returns slope=0, intercept=single value, rSquared=0 for single element', () => {
    const result = linearRegression([7.5])
    expect(result.slope).toBe(0)
    expect(result.intercept).toBe(7.5)
    expect(result.rSquared).toBe(0)
  })

  it('fits a perfect line: y = 2x + 3 gives slope=2, intercept=3, rSquared=1', () => {
    // values at x=0,1,2,3,4: y = 2*0+3=3, 2*1+3=5, ..., 2*4+3=11
    const values = [3, 5, 7, 9, 11]
    const result = linearRegression(values)
    expect(result.slope).toBeCloseTo(2)
    expect(result.intercept).toBeCloseTo(3)
    expect(result.rSquared).toBeCloseTo(1)
  })

  it('fits a perfect declining line: y = -x + 10', () => {
    const values = [10, 9, 8, 7, 6]
    const result = linearRegression(values)
    expect(result.slope).toBeCloseTo(-1)
    expect(result.intercept).toBeCloseTo(10)
    expect(result.rSquared).toBeCloseTo(1)
  })

  it('fits a flat constant line: slope=0, rSquared=0', () => {
    const values = [5, 5, 5, 5, 5]
    const result = linearRegression(values)
    expect(result.slope).toBeCloseTo(0)
    expect(result.intercept).toBeCloseTo(5)
    // all residuals are 0 but ssTot is also 0 → rSquared=0 by convention
    expect(result.rSquared).toBe(0)
  })

  it('rSquared is between 0 and 1 for noisy data', () => {
    const values = [1, 3, 2, 5, 4, 6, 8, 7]
    const result = linearRegression(values)
    expect(result.rSquared).toBeGreaterThanOrEqual(0)
    expect(result.rSquared).toBeLessThanOrEqual(1)
  })
})

// ---------------------------------------------------------------------------
// buildForecast
// ---------------------------------------------------------------------------

describe('buildForecast', () => {
  it('returns basis_days=0 and empty daily for empty input', () => {
    const fc = buildForecast([])
    expect(fc.basis_days).toBe(0)
    expect(fc.daily).toHaveLength(0)
  })

  it('detects trend=up for monotonically increasing data', () => {
    const points = Array.from({ length: 7 }, (_, i) =>
      makePoint(6 - i, (i + 1) * 0.10),
    )
    const fc = buildForecast(points)
    expect(fc.trend).toBe('up')
    expect(fc.slope_per_day).toBeGreaterThan(0)
  })

  it('detects trend=down for monotonically decreasing data', () => {
    const points = Array.from({ length: 7 }, (_, i) =>
      makePoint(6 - i, (7 - i) * 0.10),
    )
    const fc = buildForecast(points)
    expect(fc.trend).toBe('down')
    expect(fc.slope_per_day).toBeLessThan(0)
  })

  it('detects trend=flat for constant data', () => {
    const points = Array.from({ length: 7 }, (_, i) => makePoint(6 - i, 1.0))
    const fc = buildForecast(points)
    expect(fc.trend).toBe('flat')
  })

  it('confidence=low when basis_days < 7', () => {
    const points = [makePoint(2, 1), makePoint(1, 2), makePoint(0, 3)]
    const fc = buildForecast(points)
    expect(fc.basis_days).toBeLessThan(7)
    expect(fc.confidence).toBe('low')
  })

  it('confidence=high when N >= 7 and rSquared > 0.5 (perfect line)', () => {
    // Perfect ascending line over 10 days → rSquared = 1
    const points = Array.from({ length: 10 }, (_, i) =>
      makePoint(9 - i, (i + 1) * 0.10),
    )
    const fc = buildForecast(points)
    expect(fc.confidence).toBe('high')
  })

  it('confidence=medium when N >= 7 and rSquared <= 0.5', () => {
    // Noisy data: alternating high/low over 8 days → poor fit
    const points = Array.from({ length: 8 }, (_, i) =>
      makePoint(7 - i, i % 2 === 0 ? 0.01 : 1.0),
    )
    const fc = buildForecast(points)
    expect(fc.confidence).toBe('medium')
  })

  it('next7d_total is correct for a perfect line y = x + 1 (7 history days)', () => {
    // 7 historical days: day0=1, day1=2, ..., day6=7
    const points = Array.from({ length: 7 }, (_, i) =>
      makePoint(6 - i, i + 1),
    )
    const fc = buildForecast(points)
    // slope should be ~1, intercept ~1
    // next 7 days: x=7..13 → 8,9,10,11,12,13,14 → sum = 77
    expect(fc.next7d_total).toBeCloseTo(77, 0)
  })

  it('next30d_total is larger than next7d_total for increasing data', () => {
    const points = Array.from({ length: 10 }, (_, i) =>
      makePoint(9 - i, (i + 1) * 0.10),
    )
    const fc = buildForecast(points)
    expect(fc.next30d_total).toBeGreaterThan(fc.next7d_total)
  })

  it('predicted totals are >= 0 (clamp prevents negative predictions)', () => {
    // Steeply declining data — regression may extrapolate below 0
    const points = Array.from({ length: 7 }, (_, i) =>
      makePoint(6 - i, Math.max(0, 5 - i * 1.5)),
    )
    const fc = buildForecast(points)
    expect(fc.next7d_total).toBeGreaterThanOrEqual(0)
    expect(fc.next30d_total).toBeGreaterThanOrEqual(0)
  })

  it('mean_daily_cost matches average of daily costs', () => {
    const points = [makePoint(2, 1), makePoint(1, 3), makePoint(0, 5)]
    const fc = buildForecast(points)
    // mean of [1, 3, 5] = 3
    expect(fc.mean_daily_cost).toBeCloseTo(3)
  })
})
