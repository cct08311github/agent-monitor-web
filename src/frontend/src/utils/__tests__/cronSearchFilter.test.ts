import { describe, it, expect } from 'vitest'
import { filterCronJobsByQuery, type SearchableCronJob } from '../cronSearchFilter'

interface TestJob extends SearchableCronJob {
  label?: string
}

const jobs: TestJob[] = [
  {
    id: 'daily-backup',
    name: 'Daily Backup',
    description: 'Backs up the database every night',
    schedule: { expr: '0 2 * * *' },
  },
  {
    id: 'weekly-report',
    name: 'Weekly Report',
    description: 'Generates a weekly summary email',
    schedule: { expr: '0 9 * * 1' },
  },
  {
    id: 'health-check',
    name: 'Health Check',
    description: null,
    schedule: { expr: '*/5 * * * *' },
  },
  {
    id: 'data-sync',
    name: null,
    description: 'Syncs data from external API',
    schedule: { expr: '30 * * * *' },
  },
]

function identity(j: TestJob): string {
  return j.name ?? j.id
}

describe('filterCronJobsByQuery', () => {
  it('empty query returns all jobs (unfiltered copy)', () => {
    const result = filterCronJobsByQuery(jobs, '', identity)
    expect(result).toHaveLength(jobs.length)
    expect(result.map((j) => j.id)).toEqual(jobs.map((j) => j.id))
  })

  it('whitespace-only query returns all jobs', () => {
    const result = filterCronJobsByQuery(jobs, '   ', identity)
    expect(result).toHaveLength(jobs.length)
  })

  it('filters by id (fuzzy match)', () => {
    const result = filterCronJobsByQuery(jobs, 'daily', identity)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('daily-backup')
  })

  it('filters by display name (alias-aware via getDisplayName)', () => {
    // Simulate aliased name via getDisplayName
    const getDisplayName = (j: TestJob) =>
      j.id === 'health-check' ? 'SystemPulse' : (j.name ?? j.id)
    const result = filterCronJobsByQuery(jobs, 'Pulse', getDisplayName)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('health-check')
  })

  it('filters by description', () => {
    const result = filterCronJobsByQuery(jobs, 'database', identity)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('daily-backup')
  })

  it('filters by cron expression', () => {
    // '*/5' fuzzy matches the health-check schedule
    const result = filterCronJobsByQuery(jobs, '*/5', identity)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('health-check')
  })

  it('is case-insensitive', () => {
    const result = filterCronJobsByQuery(jobs, 'BACKUP', identity)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('daily-backup')
  })

  it('query matching nothing returns empty array', () => {
    const result = filterCronJobsByQuery(jobs, 'xyznonexistent', identity)
    expect(result).toHaveLength(0)
  })

  it('job with null name still matches via id', () => {
    // data-sync has name: null; identity falls back to id
    const result = filterCronJobsByQuery(jobs, 'sync', identity)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('data-sync')
  })

  it('job with null description does not throw and is excluded when only description would match', () => {
    // health-check has null description; query targets description only
    const result = filterCronJobsByQuery(
      [{ id: 'null-desc-job', name: 'Null Desc', description: null, schedule: null }],
      'xxxxxx',
      (j) => j.name ?? j.id,
    )
    expect(result).toHaveLength(0)
  })

  it('does not mutate the original array', () => {
    const original = [...jobs]
    filterCronJobsByQuery(jobs, 'backup', identity)
    expect(jobs).toEqual(original)
  })

  it('partial fuzzy match on id passes (non-contiguous chars)', () => {
    // 'wkly' fuzzy matches 'weekly-report'
    const result = filterCronJobsByQuery(jobs, 'wkly', identity)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('weekly-report')
  })
})
