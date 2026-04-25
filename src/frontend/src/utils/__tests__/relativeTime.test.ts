import { describe, it, expect } from 'vitest'
import { relativeTimeFromNow } from '../relativeTime'

describe('relativeTimeFromNow', () => {
  it('returns 剛剛 for differences under 5 seconds', () => {
    const now = 1_000_000
    expect(relativeTimeFromNow(now - 3_000, now)).toBe('剛剛')
    expect(relativeTimeFromNow(now, now)).toBe('剛剛')
    expect(relativeTimeFromNow(now - 4_999, now)).toBe('剛剛')
  })

  it('returns seconds string for 3 s (well under 5 s boundary)', () => {
    const now = 1_000_000
    // 3s diff is < 5s → still 剛剛
    expect(relativeTimeFromNow(now - 3_000, now)).toBe('剛剛')
  })

  it('returns seconds string for 45 s', () => {
    const now = 1_000_000
    expect(relativeTimeFromNow(now - 45_000, now)).toBe('45s 前')
  })

  it('returns minutes string for 90 s (1 m)', () => {
    const now = 1_000_000
    expect(relativeTimeFromNow(now - 90_000, now)).toBe('1m 前')
  })

  it('returns hours string for 7200 s (2 h)', () => {
    const now = 1_000_000
    expect(relativeTimeFromNow(now - 7_200_000, now)).toBe('2h 前')
  })

  it('handles 5 s boundary exactly — first second that shows "5s 前"', () => {
    const now = 1_000_000
    expect(relativeTimeFromNow(now - 5_000, now)).toBe('5s 前')
  })

  it('handles 59 s (still seconds)', () => {
    const now = 1_000_000
    expect(relativeTimeFromNow(now - 59_000, now)).toBe('59s 前')
  })

  it('handles 60 s boundary (1m 前)', () => {
    const now = 1_000_000
    expect(relativeTimeFromNow(now - 60_000, now)).toBe('1m 前')
  })

  it('defaults now to Date.now() when not provided (smoke test)', () => {
    const past = Date.now() - 10_000
    const result = relativeTimeFromNow(past)
    // Should be "10s 前" ± a small clock drift, just ensure it is a string with 前
    expect(result).toMatch(/前$/)
  })

  it('clamps negative diff to 0 (future timestamp returns 剛剛)', () => {
    const now = 1_000_000
    expect(relativeTimeFromNow(now + 5_000, now)).toBe('剛剛')
  })
})
