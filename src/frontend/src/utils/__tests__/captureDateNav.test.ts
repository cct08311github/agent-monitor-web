import { describe, it, expect } from 'vitest'
import { captureDateKeys, hasCaptureOnDate, captureDateRange } from '../captureDateNav'
import type { Capture } from '../quickCapture'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCapture(createdAt: number, id = `id-${createdAt}`): Capture {
  return {
    id,
    body: 'test capture',
    createdAt,
    context: 'test',
  }
}

/** Returns a timestamp for a given YYYY-MM-DD string (local midnight). */
function localTs(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime()
}

const day1 = localTs('2025-01-10') // 2025-01-10 midnight
const day2 = localTs('2025-03-15') // 2025-03-15 midnight
const day3 = localTs('2025-06-01') // 2025-06-01 midnight

// ---------------------------------------------------------------------------
// captureDateKeys
// ---------------------------------------------------------------------------

describe('captureDateKeys', () => {
  it('returns an empty Set for an empty array', () => {
    expect(captureDateKeys([])).toEqual(new Set())
  })

  it('returns a Set of YYYY-MM-DD keys from captures', () => {
    const captures = [makeCapture(day1), makeCapture(day2)]
    const keys = captureDateKeys(captures)
    expect(keys.has('2025-01-10')).toBe(true)
    expect(keys.has('2025-03-15')).toBe(true)
  })

  it('de-duplicates captures on the same day', () => {
    const captures = [
      makeCapture(day1, 'a'),
      makeCapture(day1 + 3600_000, 'b'), // 1 hour later — same day
    ]
    const keys = captureDateKeys(captures)
    expect(keys.size).toBe(1)
    expect(keys.has('2025-01-10')).toBe(true)
  })

  it('includes all distinct dates', () => {
    const captures = [makeCapture(day1), makeCapture(day2), makeCapture(day3)]
    const keys = captureDateKeys(captures)
    expect(keys.size).toBe(3)
    expect(keys.has('2025-01-10')).toBe(true)
    expect(keys.has('2025-03-15')).toBe(true)
    expect(keys.has('2025-06-01')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// hasCaptureOnDate
// ---------------------------------------------------------------------------

describe('hasCaptureOnDate', () => {
  it('returns true when a capture exists on the target date', () => {
    const captures = [makeCapture(day1), makeCapture(day2)]
    expect(hasCaptureOnDate(captures, '2025-01-10')).toBe(true)
  })

  it('returns false when no capture exists on the target date', () => {
    const captures = [makeCapture(day1), makeCapture(day2)]
    expect(hasCaptureOnDate(captures, '2025-05-05')).toBe(false)
  })

  it('returns false for an empty captures array', () => {
    expect(hasCaptureOnDate([], '2025-01-10')).toBe(false)
  })

  it('matches capture that falls anywhere within the same local day', () => {
    const lateEvening = localTs('2025-03-15') + 23 * 3600_000 + 59 * 60_000
    const captures = [makeCapture(lateEvening)]
    expect(hasCaptureOnDate(captures, '2025-03-15')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// captureDateRange
// ---------------------------------------------------------------------------

describe('captureDateRange', () => {
  it('returns { min: null, max: null } for empty input', () => {
    expect(captureDateRange([])).toEqual({ min: null, max: null })
  })

  it('returns the same date as both min and max for a single capture', () => {
    const result = captureDateRange([makeCapture(day2)])
    expect(result).toEqual({ min: '2025-03-15', max: '2025-03-15' })
  })

  it('returns correct min and max for multiple captures on different days', () => {
    const captures = [makeCapture(day2), makeCapture(day1), makeCapture(day3)]
    const result = captureDateRange(captures)
    expect(result).toEqual({ min: '2025-01-10', max: '2025-06-01' })
  })

  it('uses local timezone for date key computation (not UTC)', () => {
    // day1 is local midnight — timestamp may be different from UTC date
    // We just verify the returned key matches local date
    const result = captureDateRange([makeCapture(day1)])
    expect(result.min).toBe('2025-01-10')
    expect(result.max).toBe('2025-01-10')
  })

  it('handles multiple captures on the same day correctly', () => {
    const morning = localTs('2025-06-01')
    const afternoon = morning + 12 * 3600_000
    const captures = [makeCapture(morning, 'a'), makeCapture(afternoon, 'b')]
    const result = captureDateRange(captures)
    expect(result).toEqual({ min: '2025-06-01', max: '2025-06-01' })
  })
})
