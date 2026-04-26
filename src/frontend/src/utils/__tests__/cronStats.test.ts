import { describe, it, expect } from 'vitest'
import { computeCronStats } from '../cronStats'
import type { CronStatsInput } from '../cronStats'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface TestJob {
  id: string
  enabled?: boolean
}

function makeJob(id: string, enabled = true): TestJob {
  return { id, enabled }
}

function makeInput(
  jobs: TestJob[],
  archivedIds: string[] = [],
  pinnedIds: string[] = [],
  tagsMap: [string, string[]][] = [],
): CronStatsInput<TestJob> {
  return {
    jobs,
    archivedIds: new Set(archivedIds),
    pinnedIds,
    tagsMap: new Map(tagsMap),
  }
}

// ---------------------------------------------------------------------------
// computeCronStats
// ---------------------------------------------------------------------------

describe('computeCronStats', () => {
  it('returns zero counts for empty input', () => {
    const stats = computeCronStats(makeInput([]))
    expect(stats).toEqual({
      total: 0,
      enabled: 0,
      archived: 0,
      pinned: 0,
      tagCount: 0,
    })
  })

  it('counts total as jobs.length', () => {
    const jobs = [makeJob('1'), makeJob('2'), makeJob('3')]
    const stats = computeCronStats(makeInput(jobs))
    expect(stats.total).toBe(3)
  })

  it('counts only enabled jobs (enabled === true)', () => {
    const jobs = [makeJob('1', true), makeJob('2', false), makeJob('3', true)]
    const stats = computeCronStats(makeInput(jobs))
    expect(stats.enabled).toBe(2)
  })

  it('counts zero enabled when all jobs are disabled', () => {
    const jobs = [makeJob('1', false), makeJob('2', false)]
    const stats = computeCronStats(makeInput(jobs))
    expect(stats.enabled).toBe(0)
  })

  it('counts jobs where enabled is undefined as not enabled', () => {
    const jobs: TestJob[] = [{ id: '1' }, { id: '2', enabled: true }]
    const stats = computeCronStats(makeInput(jobs))
    expect(stats.enabled).toBe(1)
  })

  it('counts archived as intersection with archivedIds Set', () => {
    const jobs = [makeJob('1'), makeJob('2'), makeJob('3')]
    const stats = computeCronStats(makeInput(jobs, ['1', '3']))
    expect(stats.archived).toBe(2)
  })

  it('counts zero archived when archivedIds is empty', () => {
    const jobs = [makeJob('1'), makeJob('2')]
    const stats = computeCronStats(makeInput(jobs))
    expect(stats.archived).toBe(0)
  })

  it('counts archived only for IDs that exist in jobs', () => {
    const jobs = [makeJob('1')]
    // '999' is in archivedIds but not in jobs
    const stats = computeCronStats(makeInput(jobs, ['999']))
    expect(stats.archived).toBe(0)
  })

  it('counts pinned as intersection with pinnedIds array', () => {
    const jobs = [makeJob('1'), makeJob('2'), makeJob('3')]
    const stats = computeCronStats(makeInput(jobs, [], ['2']))
    expect(stats.pinned).toBe(1)
  })

  it('counts zero pinned when pinnedIds is empty', () => {
    const jobs = [makeJob('1')]
    const stats = computeCronStats(makeInput(jobs))
    expect(stats.pinned).toBe(0)
  })

  it('counts pinned only for IDs that exist in jobs', () => {
    const jobs = [makeJob('1')]
    const stats = computeCronStats(makeInput(jobs, [], ['999']))
    expect(stats.pinned).toBe(0)
  })

  it('counts unique tags across all jobs in tagsMap', () => {
    const jobs = [makeJob('1'), makeJob('2')]
    const stats = computeCronStats(
      makeInput(jobs, [], [], [
        ['1', ['alpha', 'beta']],
        ['2', ['alpha', 'gamma']],
      ]),
    )
    // unique: alpha, beta, gamma → 3
    expect(stats.tagCount).toBe(3)
  })

  it('returns tagCount=0 when tagsMap is empty', () => {
    const jobs = [makeJob('1'), makeJob('2')]
    const stats = computeCronStats(makeInput(jobs))
    expect(stats.tagCount).toBe(0)
  })

  it('deduplicates tags that appear in multiple jobs', () => {
    const jobs = [makeJob('1'), makeJob('2'), makeJob('3')]
    const stats = computeCronStats(
      makeInput(jobs, [], [], [
        ['1', ['deploy']],
        ['2', ['deploy']],
        ['3', ['deploy']],
      ]),
    )
    // all three jobs share the same tag → tagCount = 1
    expect(stats.tagCount).toBe(1)
  })

  it('works correctly with all five metrics non-empty', () => {
    const jobs = [
      makeJob('a', true),
      makeJob('b', true),
      makeJob('c', false),
      makeJob('d', false),
    ]
    const stats = computeCronStats(
      makeInput(
        jobs,
        ['c', 'd'],           // archived
        ['a'],                 // pinned
        [
          ['a', ['ops', 'weekly']],
          ['b', ['ops', 'daily']],
        ],
      ),
    )
    expect(stats.total).toBe(4)
    expect(stats.enabled).toBe(2)
    expect(stats.archived).toBe(2)
    expect(stats.pinned).toBe(1)
    expect(stats.tagCount).toBe(3) // ops, weekly, daily
  })
})
