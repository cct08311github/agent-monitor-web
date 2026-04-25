import { describe, it, expect } from 'vitest'
import { buildMarkers, formatRelative } from '../cronTimeline'
import type { TimelineJob } from '../cronTimeline'

const NOW = 1_700_000_000_000 // fixed epoch ms for deterministic tests
const HOUR_MS = 3_600_000

// ── buildMarkers ─────────────────────────────────────────────────────────────

describe('buildMarkers', () => {
  it('returns [] for empty jobs array', () => {
    expect(buildMarkers([], NOW)).toEqual([])
  })

  it('skips disabled jobs', () => {
    const jobs: TimelineJob[] = [
      { id: 'j1', name: 'Disabled', enabled: false, nextRun: NOW + HOUR_MS },
    ]
    expect(buildMarkers(jobs, NOW)).toHaveLength(0)
  })

  it('skips jobs with no nextRun', () => {
    const jobs: TimelineJob[] = [
      { id: 'j1', name: 'No next', enabled: true, nextRun: undefined },
    ]
    expect(buildMarkers(jobs, NOW)).toHaveLength(0)
  })

  it('skips jobs with non-finite nextRun', () => {
    const jobs: TimelineJob[] = [
      { id: 'j1', name: 'NaN', enabled: true, nextRun: NaN },
      { id: 'j2', name: 'Inf', enabled: true, nextRun: Infinity },
    ]
    expect(buildMarkers(jobs, NOW)).toHaveLength(0)
  })

  it('skips jobs beyond 24h window', () => {
    const jobs: TimelineJob[] = [
      { id: 'j1', name: 'Far future', enabled: true, nextRun: NOW + 25 * HOUR_MS },
    ]
    expect(buildMarkers(jobs, NOW)).toHaveLength(0)
  })

  it('includes job at the cutoff boundary (exactly 24h)', () => {
    const jobs: TimelineJob[] = [
      { id: 'j1', name: 'At cutoff', enabled: true, nextRun: NOW + 24 * HOUR_MS },
    ]
    const markers = buildMarkers(jobs, NOW)
    expect(markers).toHaveLength(1)
    expect(markers[0].hourOffset).toBe(24)
    expect(markers[0].isOverdue).toBe(false)
  })

  it('calculates correct hourOffset for job within window', () => {
    const jobs: TimelineJob[] = [
      { id: 'j1', name: 'Mid', enabled: true, nextRun: NOW + 6 * HOUR_MS },
    ]
    const markers = buildMarkers(jobs, NOW)
    expect(markers).toHaveLength(1)
    expect(markers[0].hourOffset).toBe(6)
    expect(markers[0].isOverdue).toBe(false)
  })

  it('marks overdue jobs with isOverdue=true and hourOffset=0', () => {
    const jobs: TimelineJob[] = [
      { id: 'j1', name: 'Overdue', enabled: true, nextRun: NOW - HOUR_MS },
    ]
    const markers = buildMarkers(jobs, NOW)
    expect(markers).toHaveLength(1)
    expect(markers[0].isOverdue).toBe(true)
    expect(markers[0].hourOffset).toBe(0)
  })

  it('sorts markers ascending by ts', () => {
    const jobs: TimelineJob[] = [
      { id: 'j3', name: 'Late', enabled: true, nextRun: NOW + 18 * HOUR_MS },
      { id: 'j1', name: 'Early', enabled: true, nextRun: NOW + 2 * HOUR_MS },
      { id: 'j2', name: 'Mid', enabled: true, nextRun: NOW + 10 * HOUR_MS },
    ]
    const markers = buildMarkers(jobs, NOW)
    expect(markers.map((m) => m.name)).toEqual(['Early', 'Mid', 'Late'])
  })

  it('includes multiple overdue jobs, all at hourOffset=0', () => {
    const jobs: TimelineJob[] = [
      { id: 'j1', name: 'Overdue A', enabled: true, nextRun: NOW - 2 * HOUR_MS },
      { id: 'j2', name: 'Overdue B', enabled: true, nextRun: NOW - HOUR_MS },
    ]
    const markers = buildMarkers(jobs, NOW)
    expect(markers).toHaveLength(2)
    markers.forEach((m) => {
      expect(m.isOverdue).toBe(true)
      expect(m.hourOffset).toBe(0)
    })
  })

  it('mixed enabled/disabled returns only enabled ones', () => {
    const jobs: TimelineJob[] = [
      { id: 'j1', name: 'Enabled', enabled: true, nextRun: NOW + HOUR_MS },
      { id: 'j2', name: 'Disabled', enabled: false, nextRun: NOW + HOUR_MS },
    ]
    const markers = buildMarkers(jobs, NOW)
    expect(markers).toHaveLength(1)
    expect(markers[0].name).toBe('Enabled')
  })
})

// ── formatRelative ────────────────────────────────────────────────────────────

describe('formatRelative', () => {
  it('returns "剛過" for ms === 0', () => {
    expect(formatRelative(0)).toBe('即將執行')
  })

  it('returns "即將執行" for small positive ms (< 60s)', () => {
    expect(formatRelative(30_000)).toBe('即將執行')
    expect(formatRelative(59_999)).toBe('即將執行')
  })

  it('returns "N 分後" for less than 1 hour', () => {
    expect(formatRelative(5 * 60_000)).toBe('5 分後')
    expect(formatRelative(59 * 60_000)).toBe('59 分後')
  })

  it('returns "N 小時 M 分後" for 1h+', () => {
    expect(formatRelative(90 * 60_000)).toBe('1 小時 30 分後')
    expect(formatRelative(2 * 3_600_000 + 15 * 60_000)).toBe('2 小時 15 分後')
  })

  it('returns "N 小時 0 分後" when exactly on the hour', () => {
    expect(formatRelative(3 * 3_600_000)).toBe('3 小時 0 分後')
  })

  it('returns "剛過" for negative ms within 60s', () => {
    expect(formatRelative(-1_000)).toBe('剛過')
    expect(formatRelative(-59_999)).toBe('剛過')
  })

  it('returns "逾期 N 分鐘" for overdue by more than 60s', () => {
    expect(formatRelative(-5 * 60_000)).toBe('逾期 5 分鐘')
    expect(formatRelative(-120 * 60_000)).toBe('逾期 120 分鐘')
  })
})
