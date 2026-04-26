import { describe, it, expect } from 'vitest'
import { formatTimestamp } from '../formatTimestamp'

// Fixed epoch: April 26, 2026 at 14:30:00 UTC
// Chosen so UTC assertions are deterministic across all CI/local environments.
const TS = Date.UTC(2026, 3, 26, 14, 30, 0)

// ---------------------------------------------------------------------------
// UTC mode — all assertions are deterministic
// ---------------------------------------------------------------------------

describe('formatTimestamp — UTC mode', () => {
  it('datetime style (default) returns "YYYY-MM-DD HH:mm UTC"', () => {
    expect(formatTimestamp(TS, { mode: 'utc' })).toBe('2026-04-26 14:30 UTC')
  })

  it('date style returns "YYYY-MM-DD UTC"', () => {
    expect(formatTimestamp(TS, { mode: 'utc', style: 'date' })).toBe('2026-04-26 UTC')
  })

  it('time style returns "HH:mm" without UTC suffix', () => {
    expect(formatTimestamp(TS, { mode: 'utc', style: 'time' })).toBe('14:30')
  })

  it('short style returns "MM-DD HH:mm UTC"', () => {
    expect(formatTimestamp(TS, { mode: 'utc', style: 'short' })).toBe('04-26 14:30 UTC')
  })

  it('suffix: false removes the " UTC" suffix', () => {
    expect(formatTimestamp(TS, { mode: 'utc', suffix: false })).toBe('2026-04-26 14:30')
  })

  it('accepts a Date object instead of epoch number', () => {
    expect(formatTimestamp(new Date(TS), { mode: 'utc' })).toBe('2026-04-26 14:30 UTC')
  })
})

// ---------------------------------------------------------------------------
// Local mode — only shape/pattern assertions (TZ-agnostic)
// ---------------------------------------------------------------------------

describe('formatTimestamp — local mode', () => {
  it('datetime style returns a string matching YYYY-MM-DD HH:mm pattern', () => {
    const result = formatTimestamp(TS, { mode: 'local' })
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
  })

  it('date style returns YYYY-MM-DD pattern', () => {
    expect(formatTimestamp(TS, { mode: 'local', style: 'date' })).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('time style returns HH:mm pattern without suffix', () => {
    expect(formatTimestamp(TS, { mode: 'local', style: 'time' })).toMatch(/^\d{2}:\d{2}$/)
  })

  it('short style returns MM-DD HH:mm pattern', () => {
    expect(formatTimestamp(TS, { mode: 'local', style: 'short' })).toMatch(
      /^\d{2}-\d{2} \d{2}:\d{2}$/,
    )
  })

  it('does NOT append " UTC" in local mode', () => {
    expect(formatTimestamp(TS, { mode: 'local' })).not.toContain('UTC')
  })
})

// ---------------------------------------------------------------------------
// Default mode (no opts) — acts as local
// ---------------------------------------------------------------------------

describe('formatTimestamp — default opts', () => {
  it('uses local mode and datetime style when opts is omitted', () => {
    const result = formatTimestamp(TS)
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
    expect(result).not.toContain('UTC')
  })
})

// ---------------------------------------------------------------------------
// Defensive / edge cases
// ---------------------------------------------------------------------------

describe('formatTimestamp — edge cases', () => {
  it('returns "" for NaN epoch number', () => {
    expect(formatTimestamp(NaN)).toBe('')
  })

  it('returns "" for invalid Date object', () => {
    expect(formatTimestamp(new Date('invalid'))).toBe('')
  })

  it('returns "" for NaN passed explicitly', () => {
    expect(formatTimestamp(NaN, { mode: 'utc' })).toBe('')
  })
})
