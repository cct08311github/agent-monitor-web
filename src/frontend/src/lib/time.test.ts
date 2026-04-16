import { describe, it, expect } from 'vitest'
import { formatTs } from './time'

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
