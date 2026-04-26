import { describe, it, expect } from 'vitest'
import { computeCaptureStats } from '../captureStats'
import type { Capture } from '../quickCapture'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCapture(id: string, body: string): Capture {
  return { id, body, context: 'test', createdAt: 0 }
}

// ---------------------------------------------------------------------------
// computeCaptureStats
// ---------------------------------------------------------------------------

describe('computeCaptureStats', () => {
  it('returns zero counts for empty input', () => {
    const stats = computeCaptureStats([], new Set(), [])
    expect(stats).toEqual({
      total: 0,
      archived: 0,
      pinned: 0,
      tagCount: 0,
      topTag: null,
    })
  })

  it('counts total as captures.length', () => {
    const captures = [makeCapture('1', 'a'), makeCapture('2', 'b'), makeCapture('3', 'c')]
    const stats = computeCaptureStats(captures, new Set(), [])
    expect(stats.total).toBe(3)
  })

  it('counts archived as intersection with archivedIds Set', () => {
    const captures = [makeCapture('1', 'a'), makeCapture('2', 'b'), makeCapture('3', 'c')]
    const archivedIds = new Set(['1', '3'])
    const stats = computeCaptureStats(captures, archivedIds, [])
    expect(stats.archived).toBe(2)
  })

  it('counts zero archived when archivedIds is empty', () => {
    const captures = [makeCapture('1', 'a'), makeCapture('2', 'b')]
    const stats = computeCaptureStats(captures, new Set(), [])
    expect(stats.archived).toBe(0)
  })

  it('counts archived only for IDs that exist in captures', () => {
    const captures = [makeCapture('1', 'a')]
    // '999' is in archivedIds but not in captures
    const stats = computeCaptureStats(captures, new Set(['999']), [])
    expect(stats.archived).toBe(0)
  })

  it('counts pinned as intersection with pinnedIds array', () => {
    const captures = [
      makeCapture('1', 'a'),
      makeCapture('2', 'b'),
      makeCapture('3', 'c'),
    ]
    const stats = computeCaptureStats(captures, new Set(), ['2'])
    expect(stats.pinned).toBe(1)
  })

  it('counts zero pinned when pinnedIds is empty', () => {
    const captures = [makeCapture('1', 'a')]
    const stats = computeCaptureStats(captures, new Set(), [])
    expect(stats.pinned).toBe(0)
  })

  it('counts tagCount as number of unique tags across all captures', () => {
    const captures = [
      makeCapture('1', '#alpha #beta'),
      makeCapture('2', '#alpha #gamma'),
    ]
    const stats = computeCaptureStats(captures, new Set(), [])
    // unique tags: alpha, beta, gamma → 3
    expect(stats.tagCount).toBe(3)
  })

  it('returns tagCount=0 and topTag=null for captures with no tags', () => {
    const captures = [makeCapture('1', 'no tags here'), makeCapture('2', 'plain text')]
    const stats = computeCaptureStats(captures, new Set(), [])
    expect(stats.tagCount).toBe(0)
    expect(stats.topTag).toBeNull()
  })

  it('returns topTag as the highest-count tag', () => {
    const captures = [
      makeCapture('1', '#bug'),
      makeCapture('2', '#bug #feature'),
      makeCapture('3', '#feature'),
      makeCapture('4', '#bug'),
    ]
    // bug: 3, feature: 2
    const stats = computeCaptureStats(captures, new Set(), [])
    expect(stats.topTag).toEqual({ tag: 'bug', count: 3 })
  })

  it('topTag tie-breaking is alphabetical (relies on tagCounts sort)', () => {
    const captures = [
      makeCapture('1', '#zebra #alpha'),
      makeCapture('2', '#zebra #alpha'),
    ]
    // Both have count 2; alpha < zebra alphabetically
    const stats = computeCaptureStats(captures, new Set(), [])
    expect(stats.topTag?.tag).toBe('alpha')
  })

  it('topTag returns null when captures array is empty', () => {
    const stats = computeCaptureStats([], new Set(), [])
    expect(stats.topTag).toBeNull()
  })

  it('works correctly with all three collections non-empty', () => {
    const captures = [
      makeCapture('a', '#design #ux'),
      makeCapture('b', '#design'),
      makeCapture('c', '#ops'),
    ]
    // archived: a; pinned: b, c
    const stats = computeCaptureStats(captures, new Set(['a']), ['b', 'c'])
    expect(stats.total).toBe(3)
    expect(stats.archived).toBe(1)
    expect(stats.pinned).toBe(2)
    expect(stats.tagCount).toBe(3) // design, ux, ops
    expect(stats.topTag).toEqual({ tag: 'design', count: 2 })
  })
})
