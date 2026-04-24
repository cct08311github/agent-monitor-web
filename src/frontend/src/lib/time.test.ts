import { describe, it, expect } from 'vitest'
import { formatTs, formatRelativeTime } from './time'

describe('formatTs', () => {
  it('formats a known UTC epoch as HH:mm:ss in local timezone', () => {
    // 2026-01-15T12:34:56Z → rendered in local TZ
    const result = formatTs(Date.UTC(2026, 0, 15, 12, 34, 56))
    expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/)
  })

  it('pads single-digit hours, minutes, seconds', () => {
    const result = formatTs(new Date(2026, 0, 1, 3, 5, 7).getTime())
    expect(result).toBe('03:05:07')
  })

  it('returns fallback for NaN timestamp', () => {
    expect(formatTs(Number.NaN)).toBe('--:--:--')
  })

  it('handles epoch 0 (1970-01-01)', () => {
    const result = formatTs(0)
    expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/)
  })

  it('handles midnight boundary (00:00:00)', () => {
    const result = formatTs(new Date(2026, 0, 1, 0, 0, 0).getTime())
    expect(result).toBe('00:00:00')
  })
})

describe('formatRelativeTime', () => {
  const NOW = 1_700_000_000_000

  it('returns "just now" for 0s diff (same timestamp)', () => {
    expect(formatRelativeTime(NOW, NOW)).toBe('just now')
  })

  it('returns "just now" for diff < 30s', () => {
    expect(formatRelativeTime(NOW - 29_000, NOW)).toBe('just now')
  })

  it('returns seconds ago for 30–59s diff', () => {
    expect(formatRelativeTime(NOW - 45_000, NOW)).toBe('45s ago')
  })

  it('returns minutes ago for exactly 60s', () => {
    expect(formatRelativeTime(NOW - 60_000, NOW)).toBe('1m ago')
  })

  it('returns minutes ago for 3 minutes', () => {
    expect(formatRelativeTime(NOW - 3 * 60_000, NOW)).toBe('3m ago')
  })

  it('returns hours ago for 2h diff', () => {
    expect(formatRelativeTime(NOW - 2 * 60 * 60_000, NOW)).toBe('2h ago')
  })

  it('returns days ago for 1d diff', () => {
    expect(formatRelativeTime(NOW - 24 * 60 * 60_000, NOW)).toBe('1d ago')
  })

  it('returns days ago for 3d diff', () => {
    expect(formatRelativeTime(NOW - 3 * 24 * 60 * 60_000, NOW)).toBe('3d ago')
  })

  it('returns "just now" for future timestamp (negative diff clamped)', () => {
    expect(formatRelativeTime(NOW + 5_000, NOW)).toBe('just now')
  })

  it('returns "just now" for NaN ts', () => {
    expect(formatRelativeTime(Number.NaN, NOW)).toBe('just now')
  })

  it('returns "just now" for NaN now', () => {
    expect(formatRelativeTime(NOW, Number.NaN)).toBe('just now')
  })

  it('uses Date.now() by default (no second arg)', () => {
    // Called with a ts 2 minutes in the past — should return "2m ago"
    const twoMinsAgo = Date.now() - 2 * 60_000
    expect(formatRelativeTime(twoMinsAgo)).toBe('2m ago')
  })
})
