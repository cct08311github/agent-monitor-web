import { describe, it, expect } from 'vitest'
import { computeUpcomingFires } from '../cronUpcoming'
import type { UpcomingInput } from '../cronUpcoming'

// ---------------------------------------------------------------------------
// Helper types
// ---------------------------------------------------------------------------

interface FakeJob {
  id: string
  name: string
  enabled: boolean
  expr: string
}

function makeInput(jobs: FakeJob[]): UpcomingInput<FakeJob> {
  return {
    jobs,
    getId: (j) => j.id,
    getName: (j) => j.name,
    getEnabled: (j) => j.enabled,
    getExpr: (j) => j.expr,
  }
}

// Fixed reference time: 2024-01-15 08:00:00 UTC
const FROM = new Date('2024-01-15T08:00:00.000Z')

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('computeUpcomingFires', () => {
  it('returns [] when jobs array is empty', () => {
    const result = computeUpcomingFires(makeInput([]), 24, 5, FROM)
    expect(result).toEqual([])
  })

  it('returns fires for a single enabled job with @hourly schedule', () => {
    const jobs: FakeJob[] = [{ id: 'job-1', name: 'Hourly Job', enabled: true, expr: '@hourly' }]
    const result = computeUpcomingFires(makeInput(jobs), 24, 5, FROM)

    // @hourly fires 24 times per day, but perJobLimit is 5
    expect(result.length).toBe(5)
    expect(result[0].jobId).toBe('job-1')
    expect(result[0].jobName).toBe('Hourly Job')
    expect(result[0].ts).toBeGreaterThan(FROM.getTime())
  })

  it('merges and sorts fires from multiple enabled jobs by timestamp', () => {
    // job-a: every 2 hours starting at :00
    // job-b: every 3 hours starting at :00
    const jobs: FakeJob[] = [
      { id: 'job-a', name: 'Every 2h', enabled: true, expr: '0 */2 * * *' },
      { id: 'job-b', name: 'Every 3h', enabled: true, expr: '0 */3 * * *' },
    ]
    const result = computeUpcomingFires(makeInput(jobs), 24, 5, FROM)

    // Verify sorted order
    for (let i = 1; i < result.length; i++) {
      expect(result[i].ts).toBeGreaterThanOrEqual(result[i - 1].ts)
    }

    // Both job IDs should appear
    const ids = new Set(result.map((f) => f.jobId))
    expect(ids.has('job-a')).toBe(true)
    expect(ids.has('job-b')).toBe(true)
  })

  it('excludes disabled jobs', () => {
    const jobs: FakeJob[] = [
      { id: 'job-enabled', name: 'Enabled', enabled: true, expr: '@hourly' },
      { id: 'job-disabled', name: 'Disabled', enabled: false, expr: '@hourly' },
    ]
    const result = computeUpcomingFires(makeInput(jobs), 24, 5, FROM)

    const ids = result.map((f) => f.jobId)
    expect(ids).not.toContain('job-disabled')
    expect(ids.every((id) => id === 'job-enabled')).toBe(true)
  })

  it('excludes fires beyond the 24h cutoff', () => {
    // Fire only at minute 30 of every hour — 24 fires in 24h, but perJobLimit=5
    const jobs: FakeJob[] = [
      { id: 'job-c', name: 'Half-hour', enabled: true, expr: '30 * * * *' },
    ]
    const result = computeUpcomingFires(makeInput(jobs), 24, 5, FROM)
    const cutoffTs = FROM.getTime() + 24 * 60 * 60 * 1000

    expect(result.every((f) => f.ts <= cutoffTs)).toBe(true)
    expect(result.length).toBe(5)
  })

  it('respects perJobLimit — never exceeds N fires per job', () => {
    const jobs: FakeJob[] = [
      { id: 'job-d', name: 'Minutely-ish', enabled: true, expr: '*/5 * * * *' },
    ]
    const limit = 3
    const result = computeUpcomingFires(makeInput(jobs), 24, limit, FROM)
    expect(result.length).toBeLessThanOrEqual(limit)
  })

  it('includes two jobs firing at the same timestamp — both appear in result', () => {
    // Both set to fire at :00 every hour
    const jobs: FakeJob[] = [
      { id: 'job-x', name: 'X', enabled: true, expr: '0 * * * *' },
      { id: 'job-y', name: 'Y', enabled: true, expr: '0 * * * *' },
    ]
    const result = computeUpcomingFires(makeInput(jobs), 24, 5, FROM)

    // The first fire for both should be the same ts (top of hour)
    const xFires = result.filter((f) => f.jobId === 'job-x')
    const yFires = result.filter((f) => f.jobId === 'job-y')

    expect(xFires.length).toBeGreaterThan(0)
    expect(yFires.length).toBeGreaterThan(0)

    // The earliest fire from each should share the same ts (both on the hour)
    expect(xFires[0].ts).toBe(yFires[0].ts)
  })

  it('returns [] when hoursAhead is 0 (no window)', () => {
    const jobs: FakeJob[] = [
      { id: 'job-e', name: 'E', enabled: true, expr: '*/1 * * * *' },
    ]
    const result = computeUpcomingFires(makeInput(jobs), 0, 5, FROM)
    expect(result).toEqual([])
  })

  it('handles unsupported cron expressions gracefully — skips the job', () => {
    const jobs: FakeJob[] = [
      { id: 'job-unsupported', name: 'Range expr', enabled: true, expr: '1-5 * * * *' },
      { id: 'job-valid', name: 'Valid', enabled: true, expr: '@daily' },
    ]
    const result = computeUpcomingFires(makeInput(jobs), 24, 5, FROM)
    const ids = result.map((f) => f.jobId)
    expect(ids).not.toContain('job-unsupported')
    expect(ids).toContain('job-valid')
  })

  it('handles empty expr — skips the job', () => {
    const jobs: FakeJob[] = [
      { id: 'job-empty', name: 'Empty', enabled: true, expr: '' },
      { id: 'job-ok', name: 'OK', enabled: true, expr: '@daily' },
    ]
    const result = computeUpcomingFires(makeInput(jobs), 24, 5, FROM)
    const ids = result.map((f) => f.jobId)
    expect(ids).not.toContain('job-empty')
    expect(ids).toContain('job-ok')
  })
})
