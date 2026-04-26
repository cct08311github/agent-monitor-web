import { describe, it, expect } from 'vitest'
import { computeSessionsInsights } from '../sessionsInsights'
import type { SessionLike } from '../sessionsInsights'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSession(overrides: Partial<SessionLike> & { id: string }): SessionLike {
  return {
    createdAt: null,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('computeSessionsInsights', () => {
  it('empty input → all zeros', () => {
    const result = computeSessionsInsights([], [])
    expect(result.totalSessions).toBe(0)
    expect(result.bookmarkedCount).toBe(0)
    expect(result.bookmarkPct).toBe(0)
    expect(result.hourHistogram).toHaveLength(24)
    expect(result.hourHistogram.every((v) => v === 0)).toBe(true)
    expect(result.dayHistogram).toHaveLength(7)
    expect(result.dayHistogram.every((v) => v === 0)).toBe(true)
  })

  it('bookmarkPct calculates correctly', () => {
    const sessions: SessionLike[] = [
      makeSession({ id: 's1' }),
      makeSession({ id: 's2' }),
      makeSession({ id: 's3' }),
      makeSession({ id: 's4' }),
    ]
    const result = computeSessionsInsights(sessions, ['s1', 's3'])
    expect(result.bookmarkedCount).toBe(2)
    expect(result.bookmarkPct).toBe(50)
  })

  it('bookmarkPct is rounded integer', () => {
    const sessions: SessionLike[] = [
      makeSession({ id: 's1' }),
      makeSession({ id: 's2' }),
      makeSession({ id: 's3' }),
    ]
    const result = computeSessionsInsights(sessions, ['s1'])
    expect(result.bookmarkedCount).toBe(1)
    expect(result.bookmarkPct).toBe(33) // Math.round(1/3 * 100) = 33
    expect(Number.isInteger(result.bookmarkPct)).toBe(true)
  })

  it('hourHistogram has exactly 24 buckets', () => {
    const result = computeSessionsInsights([], [])
    expect(result.hourHistogram).toHaveLength(24)
  })

  it('hourHistogram bucket index matches createdAt hour (number timestamp)', () => {
    const ts = new Date(2024, 0, 15, 14, 30, 0).getTime() // local hour 14
    const sessions: SessionLike[] = [makeSession({ id: 's1', createdAt: ts })]
    const { hourHistogram } = computeSessionsInsights(sessions, [])
    expect(hourHistogram[14]).toBe(1)
    const otherHours = hourHistogram.filter((_, i) => i !== 14)
    expect(otherHours.every((v) => v === 0)).toBe(true)
  })

  it('dayHistogram has exactly 7 buckets', () => {
    const result = computeSessionsInsights([], [])
    expect(result.dayHistogram).toHaveLength(7)
  })

  it('dayHistogram bucket index matches createdAt weekday (Sunday=0)', () => {
    // 2024-01-07 is a Sunday (getDay() === 0) in local time
    const ts = new Date(2024, 0, 7, 10, 0, 0).getTime()
    const sessions: SessionLike[] = [makeSession({ id: 's1', createdAt: ts })]
    const { dayHistogram } = computeSessionsInsights(sessions, [])
    expect(dayHistogram[0]).toBe(1) // Sunday
    const otherDays = dayHistogram.filter((_, i) => i !== 0)
    expect(otherDays.every((v) => v === 0)).toBe(true)
  })

  it('createdAt as ISO string is parsed correctly', () => {
    // Build an ISO string at local hour 9
    const local9am = new Date(2024, 3, 20, 9, 0, 0)
    const iso = local9am.toISOString()
    const sessions: SessionLike[] = [makeSession({ id: 's1', createdAt: iso })]
    const { hourHistogram } = computeSessionsInsights(sessions, [])
    // toISOString() gives UTC; Date.parse() + new Date() interprets it correctly
    const expected = new Date(iso).getHours()
    expect(hourHistogram[expected]).toBe(1)
  })

  it('sessions with missing/null createdAt are skipped without crash', () => {
    const sessions: SessionLike[] = [
      makeSession({ id: 's1', createdAt: null }),
      makeSession({ id: 's2', createdAt: undefined }),
      makeSession({ id: 's3' }), // no createdAt key
    ]
    const result = computeSessionsInsights(sessions, [])
    expect(result.totalSessions).toBe(3)
    expect(result.hourHistogram.every((v) => v === 0)).toBe(true)
    expect(result.dayHistogram.every((v) => v === 0)).toBe(true)
  })

  it('empty bookmarkedIds returns 0 bookmarkedCount', () => {
    const sessions: SessionLike[] = [
      makeSession({ id: 's1' }),
      makeSession({ id: 's2' }),
    ]
    const result = computeSessionsInsights(sessions, [])
    expect(result.bookmarkedCount).toBe(0)
    expect(result.bookmarkPct).toBe(0)
  })

  it('bookmarkedIds not present in sessions do not affect count', () => {
    const sessions: SessionLike[] = [makeSession({ id: 's1' })]
    const result = computeSessionsInsights(sessions, ['ghost-id'])
    expect(result.bookmarkedCount).toBe(0)
  })

  it('multiple sessions at same hour accumulate in correct bucket', () => {
    const ts = new Date(2024, 3, 20, 9, 0, 0).getTime() // local hour 9
    const sessions: SessionLike[] = [
      makeSession({ id: 's1', createdAt: ts }),
      makeSession({ id: 's2', createdAt: ts }),
      makeSession({ id: 's3', createdAt: ts }),
    ]
    const { hourHistogram } = computeSessionsInsights(sessions, [])
    expect(hourHistogram[9]).toBe(3)
  })

  it('totalSessions reflects all input sessions', () => {
    const sessions = Array.from({ length: 7 }, (_, i) => makeSession({ id: `s${i}` }))
    const result = computeSessionsInsights(sessions, [])
    expect(result.totalSessions).toBe(7)
  })
})
