import { describe, it, expect } from 'vitest'
import { humanizeCron } from '../cronHumanizer'

describe('humanizeCron', () => {
  // ── Invalid / edge input ────────────────────────────────────────────────────

  it('returns empty string for empty string input', () => {
    expect(humanizeCron('')).toBe('')
  })

  it('returns empty string for non-string (null-like) — guarded by type', () => {
    // TypeScript signature accepts string, but guard protects runtime
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(humanizeCron(null as any)).toBe('')
  })

  it('returns original expr for unrecognised pattern (too few parts)', () => {
    expect(humanizeCron('0 0')).toBe('0 0')
  })

  it('returns original expr for unrecognised 5-part pattern', () => {
    expect(humanizeCron('1,2 0 * * *')).toBe('1,2 0 * * *')
  })

  // ── 5-stars ─────────────────────────────────────────────────────────────────

  it('"* * * * *" → 每分鐘', () => {
    expect(humanizeCron('* * * * *')).toBe('每分鐘')
  })

  // ── */N step patterns ────────────────────────────────────────────────────────

  it('"*/5 * * * *" → 每 5 分鐘', () => {
    expect(humanizeCron('*/5 * * * *')).toBe('每 5 分鐘')
  })

  it('"*/15 * * * *" → 每 15 分鐘', () => {
    expect(humanizeCron('*/15 * * * *')).toBe('每 15 分鐘')
  })

  // ── Hourly ───────────────────────────────────────────────────────────────────

  it('"0 * * * *" → 每小時整點', () => {
    expect(humanizeCron('0 * * * *')).toBe('每小時整點')
  })

  it('"0 */6 * * *" → 每 6 小時', () => {
    expect(humanizeCron('0 */6 * * *')).toBe('每 6 小時')
  })

  it('"0 */12 * * *" → 每 12 小時', () => {
    expect(humanizeCron('0 */12 * * *')).toBe('每 12 小時')
  })

  // ── Daily ────────────────────────────────────────────────────────────────────

  it('"30 14 * * *" → 每天 14:30', () => {
    expect(humanizeCron('30 14 * * *')).toBe('每天 14:30')
  })

  it('"0 0 * * *" → 每天 00:00 (midnight)', () => {
    expect(humanizeCron('0 0 * * *')).toBe('每天 00:00')
  })

  it('"5 9 * * *" → 每天 09:05 (zero-padded)', () => {
    expect(humanizeCron('5 9 * * *')).toBe('每天 09:05')
  })

  // ── Weekly ───────────────────────────────────────────────────────────────────

  it('"0 9 * * 1" → 每週一 09:00', () => {
    expect(humanizeCron('0 9 * * 1')).toBe('每週一 09:00')
  })

  it('"30 8 * * 5" → 每週五 08:30', () => {
    expect(humanizeCron('30 8 * * 5')).toBe('每週五 08:30')
  })

  it('"0 0 * * 0" → 每週日 00:00', () => {
    expect(humanizeCron('0 0 * * 0')).toBe('每週日 00:00')
  })

  it('"0 0 * * 7" → 每週日 00:00 (7 maps to Sunday)', () => {
    expect(humanizeCron('0 0 * * 7')).toBe('每週日 00:00')
  })

  // ── Monthly ──────────────────────────────────────────────────────────────────

  it('"0 0 1 * *" → 每月 1 號 00:00', () => {
    expect(humanizeCron('0 0 1 * *')).toBe('每月 1 號 00:00')
  })

  it('"30 10 15 * *" → 每月 15 號 10:30', () => {
    expect(humanizeCron('30 10 15 * *')).toBe('每月 15 號 10:30')
  })

  // ── @-shortcuts ───────────────────────────────────────────────────────────────

  it('"@daily" → 每天 00:00', () => {
    expect(humanizeCron('@daily')).toBe('每天 00:00')
  })

  it('"@midnight" → 每天 00:00', () => {
    expect(humanizeCron('@midnight')).toBe('每天 00:00')
  })

  it('"@hourly" → 每小時整點', () => {
    expect(humanizeCron('@hourly')).toBe('每小時整點')
  })

  it('"@weekly" → 每週日 00:00', () => {
    expect(humanizeCron('@weekly')).toBe('每週日 00:00')
  })

  it('"@monthly" → 每月 1 號 00:00', () => {
    expect(humanizeCron('@monthly')).toBe('每月 1 號 00:00')
  })

  it('"@yearly" → 每年 1/1 00:00', () => {
    expect(humanizeCron('@yearly')).toBe('每年 1/1 00:00')
  })

  it('"@annually" → 每年 1/1 00:00', () => {
    expect(humanizeCron('@annually')).toBe('每年 1/1 00:00')
  })

  it('@-shortcuts are case-insensitive: "@DAILY" → 每天 00:00', () => {
    expect(humanizeCron('@DAILY')).toBe('每天 00:00')
  })

  // ── Whitespace tolerance ──────────────────────────────────────────────────────

  it('trims leading/trailing whitespace', () => {
    expect(humanizeCron('  * * * * *  ')).toBe('每分鐘')
  })
})
