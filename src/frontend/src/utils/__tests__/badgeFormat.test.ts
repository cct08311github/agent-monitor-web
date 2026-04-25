import { describe, it, expect } from 'vitest'
import { formatBadge, shouldShowBadge } from '../badgeFormat'

describe('formatBadge', () => {
  // ── 0 → empty / hidden ─────────────────────────────────────────────────────

  it('returns empty string for 0', () => {
    expect(formatBadge(0)).toBe('')
  })

  it('shouldShowBadge returns false for 0', () => {
    expect(shouldShowBadge(0)).toBe(false)
  })

  // ── 1–9 → exact number ─────────────────────────────────────────────────────

  it('returns "1" for 1', () => {
    expect(formatBadge(1)).toBe('1')
  })

  it('returns "5" for 5', () => {
    expect(formatBadge(5)).toBe('5')
  })

  it('returns "9" for 9', () => {
    expect(formatBadge(9)).toBe('9')
  })

  it('shouldShowBadge returns true for positive numbers', () => {
    expect(shouldShowBadge(1)).toBe(true)
    expect(shouldShowBadge(7)).toBe(true)
    expect(shouldShowBadge(9)).toBe(true)
  })

  // ── 10+ → '9+' ─────────────────────────────────────────────────────────────

  it('returns "9+" for 10', () => {
    expect(formatBadge(10)).toBe('9+')
  })

  it('returns "9+" for 99', () => {
    expect(formatBadge(99)).toBe('9+')
  })

  it('returns "9+" for very large numbers', () => {
    expect(formatBadge(1000)).toBe('9+')
  })

  it('shouldShowBadge returns true for 10+', () => {
    expect(shouldShowBadge(10)).toBe(true)
    expect(shouldShowBadge(100)).toBe(true)
  })

  // ── defensive: negative / NaN / Infinity → empty ──────────────────────────

  it('returns empty string for negative numbers', () => {
    expect(formatBadge(-1)).toBe('')
    expect(formatBadge(-100)).toBe('')
  })

  it('returns empty string for NaN', () => {
    expect(formatBadge(NaN)).toBe('')
  })

  it('returns empty string for Infinity', () => {
    expect(formatBadge(Infinity)).toBe('')
    expect(formatBadge(-Infinity)).toBe('')
  })

  it('shouldShowBadge returns false for negative, NaN, Infinity', () => {
    expect(shouldShowBadge(-1)).toBe(false)
    expect(shouldShowBadge(NaN)).toBe(false)
    expect(shouldShowBadge(Infinity)).toBe(false)
  })
})
