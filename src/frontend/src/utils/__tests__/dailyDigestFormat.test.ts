import { describe, it, expect } from 'vitest'
import { formatDigestForClipboard, dateOnly } from '../dailyDigestFormat'
import type { DigestData } from '../dailyDigestFormat'

function makeData(overrides: Partial<DigestData> = {}): DigestData {
  return {
    date: new Date('2026-04-26T10:00:00'),
    activeAgents: 5,
    errors24h: 3,
    activeAlerts: 1,
    enabledCronJobs: 7,
    captureCountToday: 0,
    ...overrides,
  }
}

describe('dateOnly', () => {
  it('formats date as YYYY-MM-DD', () => {
    expect(dateOnly(new Date('2026-04-26T00:00:00'))).toBe('2026-04-26')
  })

  it('pads single-digit month and day', () => {
    expect(dateOnly(new Date('2026-01-05T12:00:00'))).toBe('2026-01-05')
  })
})

describe('formatDigestForClipboard', () => {
  // 1. output contains YYYY-MM-DD date
  it('includes dateOnly in YYYY-MM-DD format', () => {
    const result = formatDigestForClipboard(makeData())
    expect(result).toContain('2026-04-26')
  })

  // 2. contains active agents count
  it('includes active agents count', () => {
    const result = formatDigestForClipboard(makeData({ activeAgents: 5 }))
    expect(result).toContain('Active agents: 5')
  })

  // 3. contains errors (last 24h) count
  it('includes errors last 24h count', () => {
    const result = formatDigestForClipboard(makeData({ errors24h: 3 }))
    expect(result).toContain('Errors (last 24h): 3')
  })

  // 4. handles 0 values — shows "0" not omitted
  it('shows 0 for all metrics when values are zero', () => {
    const result = formatDigestForClipboard(
      makeData({ activeAgents: 0, errors24h: 0, activeAlerts: 0, enabledCronJobs: 0 }),
    )
    expect(result).toContain('Active agents: 0')
    expect(result).toContain('Errors (last 24h): 0')
    expect(result).toContain('Active alerts: 0')
    expect(result).toContain('Cron jobs enabled: 0')
  })

  // 5. contains all 4 metric lines
  it('includes all 4 metric lines', () => {
    const result = formatDigestForClipboard(makeData())
    expect(result).toContain('Active agents:')
    expect(result).toContain('Errors (last 24h):')
    expect(result).toContain('Active alerts:')
    expect(result).toContain('Cron jobs enabled:')
  })

  // 6. title line contains emoji and label
  it('title line contains 📊 and 當日摘要', () => {
    const result = formatDigestForClipboard(makeData())
    const firstLine = result.split('\n')[0]
    expect(firstLine).toContain('📊')
    expect(firstLine).toContain('當日摘要')
  })

  // 7. correct active alerts value
  it('includes active alerts count', () => {
    const result = formatDigestForClipboard(makeData({ activeAlerts: 2 }))
    expect(result).toContain('Active alerts: 2')
  })

  // 8. correct cron count
  it('includes enabled cron jobs count', () => {
    const result = formatDigestForClipboard(makeData({ enabledCronJobs: 7 }))
    expect(result).toContain('Cron jobs enabled: 7')
  })

  // 9. captures count when > 0
  it('includes Captures (today) with count 5', () => {
    const result = formatDigestForClipboard(makeData({ captureCountToday: 5 }))
    expect(result).toContain('Captures (today): 5')
  })

  // 10. captures count when 0 — must not be omitted
  it('includes Captures (today): 0 when count is zero', () => {
    const result = formatDigestForClipboard(makeData({ captureCountToday: 0 }))
    expect(result).toContain('Captures (today): 0')
  })

  // 11. DigestData type accepts captureCountToday field
  it('DigestData accepts captureCountToday field', () => {
    const data: DigestData = makeData({ captureCountToday: 12 })
    expect(data.captureCountToday).toBe(12)
  })
})
