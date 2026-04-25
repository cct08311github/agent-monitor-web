import { describe, it, expect } from 'vitest'
import { formatTs, formatRelativeTime, formatCountdown } from './time'

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

describe('formatCountdown', () => {
  const NOW = 1_700_000_000_000

  it('returns "即將執行" for diff exactly at 30s boundary', () => {
    expect(formatCountdown(NOW + 30_000, NOW)).toBe('即將執行')
  })

  it('returns "即將執行" for diff < 30s (e.g. 10s ahead)', () => {
    expect(formatCountdown(NOW + 10_000, NOW)).toBe('即將執行')
  })

  it('returns "X 秒後" for 31–59s ahead', () => {
    expect(formatCountdown(NOW + 45_000, NOW)).toBe('45 秒後')
  })

  it('returns "X 分 Y 秒後" for 90s ahead', () => {
    expect(formatCountdown(NOW + 90_000, NOW)).toBe('1 分 30 秒後')
  })

  it('returns "X 分 0 秒後" for exact minutes ahead', () => {
    expect(formatCountdown(NOW + 3 * 60_000, NOW)).toBe('3 分 0 秒後')
  })

  it('returns "X 小時 Y 分後" for 2h 30m ahead', () => {
    expect(formatCountdown(NOW + (2 * 60 + 30) * 60_000, NOW)).toBe('2 小時 30 分後')
  })

  it('returns "X 小時 0 分後" for exact hours ahead', () => {
    expect(formatCountdown(NOW + 3 * 3600_000, NOW)).toBe('3 小時 0 分後')
  })

  it('returns "即將執行" for overdue within 60s grace window (e.g. -30s)', () => {
    expect(formatCountdown(NOW - 30_000, NOW)).toBe('即將執行')
  })

  it('returns "逾期 N 分鐘" for overdue > 60s', () => {
    expect(formatCountdown(NOW - 5 * 60_000, NOW)).toBe('逾期 5 分鐘')
  })

  it('returns "逾期 1 分鐘" for exactly 61s overdue', () => {
    expect(formatCountdown(NOW - 61_000, NOW)).toBe('逾期 1 分鐘')
  })

  it('returns "未排程" for targetMs = 0', () => {
    expect(formatCountdown(0, NOW)).toBe('未排程')
  })

  it('returns "未排程" for negative targetMs', () => {
    expect(formatCountdown(-1000, NOW)).toBe('未排程')
  })

  it('returns "未排程" for NaN targetMs', () => {
    expect(formatCountdown(Number.NaN, NOW)).toBe('未排程')
  })

  it('returns "未排程" for Infinity targetMs', () => {
    expect(formatCountdown(Infinity, NOW)).toBe('未排程')
  })

  it('uses Date.now() by default (no second arg)', () => {
    const oneMinuteAhead = Date.now() + 60_000
    const result = formatCountdown(oneMinuteAhead)
    // Should be around "1 分 0 秒後" but not "即將執行" or "未排程"
    expect(result).toMatch(/分/)
  })
})
