import { describe, it, expect } from 'vitest'
import { nextFireTimes } from '../cronNextFires'

// Fixed reference date: 2026-04-26T11:00:00 UTC (local time)
function makeDate(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  // Use local time (same as the engine under test)
  return new Date(year, month - 1, day, hour, minute, 0, 0)
}

describe('nextFireTimes', () => {
  it('* * * * * — every minute, next 3', () => {
    const from = makeDate(2026, 4, 26, 11, 0)
    const { supported, times } = nextFireTimes('* * * * *', 3, from)
    expect(supported).toBe(true)
    expect(times).toHaveLength(3)
    expect(times[0]).toEqual(makeDate(2026, 4, 26, 11, 1))
    expect(times[1]).toEqual(makeDate(2026, 4, 26, 11, 2))
    expect(times[2]).toEqual(makeDate(2026, 4, 26, 11, 3))
  })

  it('*/5 * * * * — every 5 min, from :01 → :05 :10 :15', () => {
    const from = makeDate(2026, 4, 26, 11, 1)
    const { supported, times } = nextFireTimes('*/5 * * * *', 3, from)
    expect(supported).toBe(true)
    expect(times[0]).toEqual(makeDate(2026, 4, 26, 11, 5))
    expect(times[1]).toEqual(makeDate(2026, 4, 26, 11, 10))
    expect(times[2]).toEqual(makeDate(2026, 4, 26, 11, 15))
  })

  it('*/15 * * * * — every 15 min, from :55 → :00 :15 :30 :45 13:00', () => {
    const from = makeDate(2026, 4, 26, 11, 55)
    const { supported, times } = nextFireTimes('*/15 * * * *', 5, from)
    expect(supported).toBe(true)
    expect(times[0]).toEqual(makeDate(2026, 4, 26, 12, 0))
    expect(times[1]).toEqual(makeDate(2026, 4, 26, 12, 15))
    expect(times[2]).toEqual(makeDate(2026, 4, 26, 12, 30))
    expect(times[3]).toEqual(makeDate(2026, 4, 26, 12, 45))
    expect(times[4]).toEqual(makeDate(2026, 4, 26, 13, 0))
  })

  it('0 * * * * — top-of-hour, from :30 → 12:00 13:00 14:00', () => {
    const from = makeDate(2026, 4, 26, 11, 30)
    const { supported, times } = nextFireTimes('0 * * * *', 3, from)
    expect(supported).toBe(true)
    expect(times[0]).toEqual(makeDate(2026, 4, 26, 12, 0))
    expect(times[1]).toEqual(makeDate(2026, 4, 26, 13, 0))
    expect(times[2]).toEqual(makeDate(2026, 4, 26, 14, 0))
  })

  it('0 */2 * * * — every 2 hours on the hour, from 11:00 → 12:00 14:00 16:00', () => {
    const from = makeDate(2026, 4, 26, 11, 0)
    const { supported, times } = nextFireTimes('0 */2 * * *', 3, from)
    expect(supported).toBe(true)
    expect(times[0]).toEqual(makeDate(2026, 4, 26, 12, 0))
    expect(times[1]).toEqual(makeDate(2026, 4, 26, 14, 0))
    expect(times[2]).toEqual(makeDate(2026, 4, 26, 16, 0))
  })

  it('30 9 * * * — every day 09:30, from 08:00 → today, next day, day after', () => {
    const from = makeDate(2026, 4, 26, 8, 0)
    const { supported, times } = nextFireTimes('30 9 * * *', 3, from)
    expect(supported).toBe(true)
    expect(times[0]).toEqual(makeDate(2026, 4, 26, 9, 30))
    expect(times[1]).toEqual(makeDate(2026, 4, 27, 9, 30))
    expect(times[2]).toEqual(makeDate(2026, 4, 28, 9, 30))
  })

  it('0 9 * * 1 — every Monday 09:00, from Tuesday 2026-04-28', () => {
    // 2026-04-28 is a Tuesday; next Monday is 2026-05-04
    const from = makeDate(2026, 4, 28, 10, 0)
    const { supported, times } = nextFireTimes('0 9 * * 1', 1, from)
    expect(supported).toBe(true)
    expect(times[0]).toEqual(makeDate(2026, 5, 4, 9, 0))
  })

  it('0 9 * * 0 — every Sunday 09:00, from Friday 2026-04-24', () => {
    // 2026-04-24 is a Friday; next Sunday is 2026-04-26
    const from = makeDate(2026, 4, 24, 10, 0)
    const { supported, times } = nextFireTimes('0 9 * * 0', 1, from)
    expect(supported).toBe(true)
    expect(times[0]).toEqual(makeDate(2026, 4, 26, 9, 0))
  })

  it('0 9 * * 7 — dow=7 treated same as dow=0 (Sunday)', () => {
    const from = makeDate(2026, 4, 24, 10, 0)
    const { supported: s7, times: t7 } = nextFireTimes('0 9 * * 7', 1, from)
    const { times: t0 } = nextFireTimes('0 9 * * 0', 1, from)
    expect(s7).toBe(true)
    expect(t7[0]).toEqual(t0[0])
  })

  it('0 0 1 * * — first of every month at midnight', () => {
    const from = makeDate(2026, 4, 26, 0, 0)
    const { supported, times } = nextFireTimes('0 0 1 * *', 3, from)
    expect(supported).toBe(true)
    expect(times[0]).toEqual(makeDate(2026, 5, 1, 0, 0))
    expect(times[1]).toEqual(makeDate(2026, 6, 1, 0, 0))
    expect(times[2]).toEqual(makeDate(2026, 7, 1, 0, 0))
  })

  it('@daily → midnight next day', () => {
    const from = makeDate(2026, 4, 26, 8, 0)
    const { supported, times } = nextFireTimes('@daily', 1, from)
    expect(supported).toBe(true)
    expect(times[0]).toEqual(makeDate(2026, 4, 27, 0, 0))
  })

  it('@hourly → top of next hour', () => {
    const from = makeDate(2026, 4, 26, 11, 30)
    const { supported, times } = nextFireTimes('@hourly', 1, from)
    expect(supported).toBe(true)
    expect(times[0]).toEqual(makeDate(2026, 4, 26, 12, 0))
  })

  it('@midnight → midnight next day (same as @daily)', () => {
    const from = makeDate(2026, 4, 26, 10, 0)
    const { supported, times } = nextFireTimes('@midnight', 1, from)
    expect(supported).toBe(true)
    expect(times[0]).toEqual(makeDate(2026, 4, 27, 0, 0))
  })

  it('@weekly → every Sunday 00:00', () => {
    // 2026-04-26 is a Sunday, so next Sunday is 2026-05-03
    const from = makeDate(2026, 4, 26, 1, 0)
    const { supported, times } = nextFireTimes('@weekly', 1, from)
    expect(supported).toBe(true)
    expect(times[0]).toEqual(makeDate(2026, 5, 3, 0, 0))
  })

  it('@monthly → first of next month 00:00', () => {
    const from = makeDate(2026, 4, 26, 0, 0)
    const { supported, times } = nextFireTimes('@monthly', 1, from)
    expect(supported).toBe(true)
    expect(times[0]).toEqual(makeDate(2026, 5, 1, 0, 0))
  })

  it('@yearly → January 1st 00:00 of next year', () => {
    const from = makeDate(2026, 4, 26, 0, 0)
    const { supported, times } = nextFireTimes('@yearly', 1, from)
    expect(supported).toBe(true)
    expect(times[0]).toEqual(makeDate(2027, 1, 1, 0, 0))
  })

  it('@annually → same as @yearly', () => {
    const from = makeDate(2026, 4, 26, 0, 0)
    const { times: ty } = nextFireTimes('@yearly', 1, from)
    const { times: ta } = nextFireTimes('@annually', 1, from)
    expect(ta[0]).toEqual(ty[0])
  })

  it('0 9-17 * * * — range expression → supported: false', () => {
    const { supported } = nextFireTimes('0 9-17 * * *', 5)
    expect(supported).toBe(false)
  })

  it('0,30 * * * * — list expression → supported: false', () => {
    const { supported } = nextFireTimes('0,30 * * * *', 5)
    expect(supported).toBe(false)
  })

  it('abc — garbage input → supported: false', () => {
    const { supported } = nextFireTires_alias('abc', 5)
    expect(supported).toBe(false)
  })

  it('empty string → supported: false', () => {
    const { supported } = nextFireTimes('', 5)
    expect(supported).toBe(false)
  })

  it('too few fields → supported: false', () => {
    const { supported } = nextFireTimes('* * *', 5)
    expect(supported).toBe(false)
  })

  it('too many fields → supported: false', () => {
    const { supported } = nextFireTimes('* * * * * *', 5)
    expect(supported).toBe(false)
  })

  it('0 0 * * * — midnight every day (daily pattern)', () => {
    const from = makeDate(2026, 4, 26, 1, 0)
    const { supported, times } = nextFireTimes('0 0 * * *', 3, from)
    expect(supported).toBe(true)
    expect(times[0]).toEqual(makeDate(2026, 4, 27, 0, 0))
    expect(times[1]).toEqual(makeDate(2026, 4, 28, 0, 0))
    expect(times[2]).toEqual(makeDate(2026, 4, 29, 0, 0))
  })

  it('30 9 * * * — already past 09:30 → next day', () => {
    const from = makeDate(2026, 4, 26, 10, 0)
    const { times } = nextFireTimes('30 9 * * *', 1, from)
    expect(times[0]).toEqual(makeDate(2026, 4, 27, 9, 30))
  })

  it('Vixie OR semantics: both dom and dow specified', () => {
    // 0 9 1 * 1 — fires on day-of-month=1 OR Monday at 09:00
    // From 2026-04-26 (Sunday), next fire: 2026-05-01 09:00 (Friday, dom=1)
    const from = makeDate(2026, 4, 26, 10, 0)
    const { supported, times } = nextFireTimes('0 9 1 * 1', 1, from)
    expect(supported).toBe(true)
    // Next Monday is 2026-04-27, which should fire first
    expect(times[0]).toEqual(makeDate(2026, 4, 27, 9, 0))
  })
})

// Alias to test garbage input (avoids lint complaints about unused imports)
function nextFireTires_alias(expr: string, count: number) {
  return nextFireTimes(expr, count)
}
