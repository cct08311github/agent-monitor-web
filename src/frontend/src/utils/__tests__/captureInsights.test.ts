import { describe, it, expect } from 'vitest'
import { computeInsights } from '../captureInsights'
import type { Capture } from '../quickCapture'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCapture(
  id: string,
  body: string,
  context: string,
  createdAt: number,
): Capture {
  return { id, body, context, createdAt }
}

/** Build a Date timestamp for a specific hour and weekday offset from a base epoch. */
function tsAt(hour: number, dayOffset = 0): number {
  // 2024-01-07 is a Sunday (day=0).  Add dayOffset days, set hour.
  const d = new Date(2024, 0, 7 + dayOffset)
  d.setHours(hour, 0, 0, 0)
  return d.getTime()
}

// ---------------------------------------------------------------------------
// computeInsights — empty input
// ---------------------------------------------------------------------------

describe('computeInsights — empty input', () => {
  it('returns empty top lists and zero histograms for empty captures', () => {
    const result = computeInsights([])
    expect(result.topTags).toEqual([])
    expect(result.topContexts).toEqual([])
    expect(result.hourHistogram).toHaveLength(24)
    expect(result.dayHistogram).toHaveLength(7)
    expect(result.hourHistogram.every((v) => v === 0)).toBe(true)
    expect(result.dayHistogram.every((v) => v === 0)).toBe(true)
    expect(result.avgPerActiveDay).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// topTags
// ---------------------------------------------------------------------------

describe('computeInsights — topTags', () => {
  it('returns top 3 tags sorted by count descending', () => {
    const captures = [
      makeCapture('1', '#a #b #c', '', 0),
      makeCapture('2', '#a #b', '', 0),
      makeCapture('3', '#a', '', 0),
    ]
    // a:3, b:2, c:1
    const { topTags } = computeInsights(captures)
    expect(topTags).toHaveLength(3)
    expect(topTags[0].label).toBe('a')
    expect(topTags[0].count).toBe(3)
    expect(topTags[1].label).toBe('b')
    expect(topTags[1].count).toBe(2)
    expect(topTags[2].label).toBe('c')
    expect(topTags[2].count).toBe(1)
  })

  it('returns at most 3 tags even when more exist', () => {
    const captures = [
      makeCapture('1', '#a #b #c #d #e', '', 0),
      makeCapture('2', '#a #b #c #d #e', '', 0),
    ]
    const { topTags } = computeInsights(captures)
    expect(topTags).toHaveLength(3)
  })

  it('breaks same-count ties alphabetically', () => {
    const captures = [
      makeCapture('1', '#zebra', '', 0),
      makeCapture('2', '#alpha', '', 0),
    ]
    // Both count=1; alpha < zebra
    const { topTags } = computeInsights(captures)
    expect(topTags[0].label).toBe('alpha')
    expect(topTags[1].label).toBe('zebra')
  })

  it('computes pct based on total tag instances', () => {
    const captures = [
      makeCapture('1', '#a #b', '', 0),
      makeCapture('2', '#a', '', 0),
    ]
    // tag instances: a=2, b=1 → total=3
    // a pct = round(2/3*100) = 67
    const { topTags } = computeInsights(captures)
    const aItem = topTags.find((t) => t.label === 'a')
    expect(aItem?.pct).toBe(67)
    const bItem = topTags.find((t) => t.label === 'b')
    expect(bItem?.pct).toBe(33)
  })

  it('returns empty array when no tags exist', () => {
    const captures = [makeCapture('1', 'no tags', '', 0)]
    const { topTags } = computeInsights(captures)
    expect(topTags).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// topContexts
// ---------------------------------------------------------------------------

describe('computeInsights — topContexts', () => {
  it('returns top 3 contexts sorted by count descending', () => {
    const captures = [
      makeCapture('1', '', 'work', 0),
      makeCapture('2', '', 'work', 0),
      makeCapture('3', '', 'home', 0),
      makeCapture('4', '', 'side', 0),
    ]
    // work:2, home:1, side:1
    const { topContexts } = computeInsights(captures)
    expect(topContexts[0].label).toBe('work')
    expect(topContexts[0].count).toBe(2)
    // home and side both count=1, alpha order: home < side
    expect(topContexts[1].label).toBe('home')
    expect(topContexts[2].label).toBe('side')
  })

  it('returns at most 3 contexts even when more exist', () => {
    const captures = ['ctx1', 'ctx2', 'ctx3', 'ctx4'].map((ctx, i) =>
      makeCapture(String(i), '', ctx, 0),
    )
    const { topContexts } = computeInsights(captures)
    expect(topContexts).toHaveLength(3)
  })

  it('returns empty array when all contexts are empty strings', () => {
    // empty string context is falsy — skipped by the util
    const captures = [makeCapture('1', 'body', '', 0)]
    const { topContexts } = computeInsights(captures)
    expect(topContexts).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// hourHistogram
// ---------------------------------------------------------------------------

describe('computeInsights — hourHistogram', () => {
  it('always has exactly 24 buckets', () => {
    const { hourHistogram } = computeInsights([])
    expect(hourHistogram).toHaveLength(24)
  })

  it('increments the correct bucket for a capture at hour 14', () => {
    const captures = [makeCapture('1', '', '', tsAt(14))]
    const { hourHistogram } = computeInsights(captures)
    expect(hourHistogram[14]).toBe(1)
    // All other buckets should be 0
    expect(hourHistogram.reduce((a, b) => a + b, 0)).toBe(1)
  })

  it('counts multiple captures in the same hour bucket', () => {
    const captures = [
      makeCapture('1', '', '', tsAt(9)),
      makeCapture('2', '', '', tsAt(9)),
      makeCapture('3', '', '', tsAt(9)),
    ]
    const { hourHistogram } = computeInsights(captures)
    expect(hourHistogram[9]).toBe(3)
  })
})

// ---------------------------------------------------------------------------
// dayHistogram
// ---------------------------------------------------------------------------

describe('computeInsights — dayHistogram', () => {
  it('always has exactly 7 buckets', () => {
    const { dayHistogram } = computeInsights([])
    expect(dayHistogram).toHaveLength(7)
  })

  it('increments the correct bucket — day 0 = Sunday', () => {
    // 2024-01-07 is Sunday (dayOffset=0)
    const captures = [makeCapture('1', '', '', tsAt(10, 0))]
    const { dayHistogram } = computeInsights(captures)
    expect(dayHistogram[0]).toBe(1) // Sunday
    expect(dayHistogram.reduce((a, b) => a + b, 0)).toBe(1)
  })

  it('increments the correct bucket — day 3 = Wednesday', () => {
    // dayOffset=3 → 2024-01-10 Wednesday
    const captures = [makeCapture('1', '', '', tsAt(10, 3))]
    const { dayHistogram } = computeInsights(captures)
    expect(dayHistogram[3]).toBe(1) // Wednesday
  })
})

// ---------------------------------------------------------------------------
// avgPerActiveDay
// ---------------------------------------------------------------------------

describe('computeInsights — avgPerActiveDay', () => {
  it('returns 0 for empty captures', () => {
    expect(computeInsights([]).avgPerActiveDay).toBe(0)
  })

  it('returns totalCaptures when all are on the same day', () => {
    const captures = [
      makeCapture('1', '', '', tsAt(8, 0)),
      makeCapture('2', '', '', tsAt(10, 0)),
      makeCapture('3', '', '', tsAt(14, 0)),
    ]
    // 3 captures on 1 active day → avg = 3
    const { avgPerActiveDay } = computeInsights(captures)
    expect(avgPerActiveDay).toBe(3)
  })

  it('divides total by number of unique calendar days', () => {
    const captures = [
      makeCapture('1', '', '', tsAt(8, 0)),  // day 0
      makeCapture('2', '', '', tsAt(8, 0)),  // day 0
      makeCapture('3', '', '', tsAt(8, 1)),  // day 1
    ]
    // 3 captures across 2 active days → avg = 1.5
    const { avgPerActiveDay } = computeInsights(captures)
    expect(avgPerActiveDay).toBe(1.5)
  })
})
