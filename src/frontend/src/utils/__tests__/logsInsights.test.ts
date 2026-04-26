import { describe, it, expect } from 'vitest'
import { computeLogsInsights } from '../logsInsights'
import type { LogEntry } from '../logsJsonExport'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(
  ts: number,
  level?: string,
  agent?: string,
  message = 'test log',
): LogEntry {
  return { ts, level, agent, message }
}

/** Build a timestamp for a specific hour on a fixed date. */
function tsAtHour(hour: number): number {
  const d = new Date(2024, 0, 15) // 2024-01-15
  d.setHours(hour, 30, 0, 0)
  return d.getTime()
}

// ---------------------------------------------------------------------------
// empty input
// ---------------------------------------------------------------------------

describe('computeLogsInsights — empty input', () => {
  it('returns all empty arrays and 24-bucket zeroed histogram', () => {
    const result = computeLogsInsights([])
    expect(result.levels).toEqual([])
    expect(result.topAgents).toEqual([])
    expect(result.hourHistogram).toHaveLength(24)
    expect(result.hourHistogram.every((v) => v === 0)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// levels
// ---------------------------------------------------------------------------

describe('computeLogsInsights — levels', () => {
  it('counts levels case-insensitively (normalises to lowercase)', () => {
    const entries = [
      makeEntry(0, 'ERROR'),
      makeEntry(0, 'error'),
      makeEntry(0, 'WARN'),
      makeEntry(0, 'info'),
    ]
    const { levels } = computeLogsInsights(entries)
    const errorItem = levels.find((l) => l.label === 'error')
    expect(errorItem?.count).toBe(2)
    const warnItem = levels.find((l) => l.label === 'warn')
    expect(warnItem?.count).toBe(1)
  })

  it('sorts levels by count descending', () => {
    const entries = [
      makeEntry(0, 'info'),
      makeEntry(0, 'info'),
      makeEntry(0, 'info'),
      makeEntry(0, 'warn'),
      makeEntry(0, 'warn'),
      makeEntry(0, 'error'),
    ]
    const { levels } = computeLogsInsights(entries)
    expect(levels[0].label).toBe('info')
    expect(levels[0].count).toBe(3)
    expect(levels[1].label).toBe('warn')
    expect(levels[1].count).toBe(2)
    expect(levels[2].label).toBe('error')
    expect(levels[2].count).toBe(1)
  })

  it('defaults missing level to "info"', () => {
    const entries = [makeEntry(0, undefined), makeEntry(0, undefined)]
    const { levels } = computeLogsInsights(entries)
    const infoItem = levels.find((l) => l.label === 'info')
    expect(infoItem?.count).toBe(2)
  })

  it('computes pct as percentage of total entries', () => {
    const entries = [
      makeEntry(0, 'error'),
      makeEntry(0, 'error'),
      makeEntry(0, 'info'),
      makeEntry(0, 'info'),
    ]
    // 2 error, 2 info out of 4 total → each 50%
    const { levels } = computeLogsInsights(entries)
    const errorItem = levels.find((l) => l.label === 'error')
    expect(errorItem?.pct).toBe(50)
    const infoItem = levels.find((l) => l.label === 'info')
    expect(infoItem?.pct).toBe(50)
  })

  it('breaks same-count ties alphabetically', () => {
    const entries = [
      makeEntry(0, 'warn'),
      makeEntry(0, 'error'),
    ]
    // both count=1; "error" < "warn" alphabetically
    const { levels } = computeLogsInsights(entries)
    expect(levels[0].label).toBe('error')
    expect(levels[1].label).toBe('warn')
  })
})

// ---------------------------------------------------------------------------
// topAgents
// ---------------------------------------------------------------------------

describe('computeLogsInsights — topAgents', () => {
  it('returns top 3 agents by log count', () => {
    const entries = [
      makeEntry(0, 'info', 'agent-a'),
      makeEntry(0, 'info', 'agent-a'),
      makeEntry(0, 'info', 'agent-a'),
      makeEntry(0, 'info', 'agent-b'),
      makeEntry(0, 'info', 'agent-b'),
      makeEntry(0, 'info', 'agent-c'),
      makeEntry(0, 'info', 'agent-d'), // 4th agent — should be excluded
    ]
    const { topAgents } = computeLogsInsights(entries)
    expect(topAgents).toHaveLength(3)
    expect(topAgents[0].label).toBe('agent-a')
    expect(topAgents[0].count).toBe(3)
    expect(topAgents[1].label).toBe('agent-b')
    expect(topAgents[2].count).toBe(1)
  })

  it('returns empty array when no entries have agent field', () => {
    const entries = [makeEntry(0, 'info', undefined)]
    const { topAgents } = computeLogsInsights(entries)
    expect(topAgents).toEqual([])
  })

  it('breaks same-count ties alphabetically', () => {
    const entries = [
      makeEntry(0, 'info', 'zebra'),
      makeEntry(0, 'info', 'alpha'),
    ]
    const { topAgents } = computeLogsInsights(entries)
    expect(topAgents[0].label).toBe('alpha')
    expect(topAgents[1].label).toBe('zebra')
  })
})

// ---------------------------------------------------------------------------
// hourHistogram
// ---------------------------------------------------------------------------

describe('computeLogsInsights — hourHistogram', () => {
  it('always has exactly 24 buckets', () => {
    const { hourHistogram } = computeLogsInsights([])
    expect(hourHistogram).toHaveLength(24)
  })

  it('increments the correct bucket for an entry at 14:30', () => {
    const entries = [makeEntry(tsAtHour(14))]
    const { hourHistogram } = computeLogsInsights(entries)
    expect(hourHistogram[14]).toBe(1)
    // Sum of all buckets should equal number of entries
    expect(hourHistogram.reduce((a, b) => a + b, 0)).toBe(1)
  })

  it('increments the correct bucket for an entry at hour 0', () => {
    const entries = [makeEntry(tsAtHour(0))]
    const { hourHistogram } = computeLogsInsights(entries)
    expect(hourHistogram[0]).toBe(1)
  })

  it('increments the correct bucket for an entry at hour 23', () => {
    const entries = [makeEntry(tsAtHour(23))]
    const { hourHistogram } = computeLogsInsights(entries)
    expect(hourHistogram[23]).toBe(1)
  })

  it('accumulates multiple entries in the same hour bucket', () => {
    const entries = [
      makeEntry(tsAtHour(9)),
      makeEntry(tsAtHour(9)),
      makeEntry(tsAtHour(9)),
    ]
    const { hourHistogram } = computeLogsInsights(entries)
    expect(hourHistogram[9]).toBe(3)
  })

  it('distributes entries across different hour buckets correctly', () => {
    const entries = [
      makeEntry(tsAtHour(6)),
      makeEntry(tsAtHour(12)),
      makeEntry(tsAtHour(12)),
      makeEntry(tsAtHour(18)),
    ]
    const { hourHistogram } = computeLogsInsights(entries)
    expect(hourHistogram[6]).toBe(1)
    expect(hourHistogram[12]).toBe(2)
    expect(hourHistogram[18]).toBe(1)
    expect(hourHistogram.reduce((a, b) => a + b, 0)).toBe(4)
  })
})
