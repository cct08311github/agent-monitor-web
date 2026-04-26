import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  loadCronTags,
  saveCronTags,
  addCronTag,
  removeCronTag,
  loadAllCronTags,
  uniqueCronTags,
  filterJobsByTag,
} from '../cronTags'

function makeLocalStorageStub(seed: Record<string, string> = {}) {
  const store: Record<string, string> = { ...seed }
  return {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => {
      store[k] = String(v)
    },
    removeItem: (k: string) => {
      delete store[k]
    },
    clear: () => {
      for (const k of Object.keys(store)) delete store[k]
    },
    key: (i: number) => Object.keys(store)[i] ?? null,
    get length() {
      return Object.keys(store).length
    },
  } as Storage
}

describe('cronTags', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeLocalStorageStub())
  })

  // -------------------------------------------------------------------------
  // loadCronTags
  // -------------------------------------------------------------------------

  it('loadCronTags returns [] when key absent', () => {
    expect(loadCronTags('job-1')).toEqual([])
  })

  it('loadCronTags returns [] for invalid JSON', () => {
    vi.stubGlobal('localStorage', makeLocalStorageStub({ 'oc_cron_tags:job-1': 'not-json' }))
    expect(loadCronTags('job-1')).toEqual([])
  })

  it('loadCronTags returns [] when stored value is not an array', () => {
    vi.stubGlobal(
      'localStorage',
      makeLocalStorageStub({ 'oc_cron_tags:job-1': JSON.stringify({ tag: 'x' }) }),
    )
    expect(loadCronTags('job-1')).toEqual([])
  })

  // -------------------------------------------------------------------------
  // saveCronTags / round-trip
  // -------------------------------------------------------------------------

  it('saveCronTags + loadCronTags round-trip', () => {
    saveCronTags('job-1', ['critical', 'weekly'])
    expect(loadCronTags('job-1')).toEqual(['critical', 'weekly'])
  })

  it('saveCronTags with empty array removes key', () => {
    saveCronTags('job-1', ['critical'])
    saveCronTags('job-1', [])
    expect(loadCronTags('job-1')).toEqual([])
  })

  // -------------------------------------------------------------------------
  // addCronTag
  // -------------------------------------------------------------------------

  it('addCronTag adds a new tag and returns updated list', () => {
    const result = addCronTag('job-1', 'critical')
    expect(result).toEqual(['critical'])
    expect(loadCronTags('job-1')).toEqual(['critical'])
  })

  it('addCronTag lowercases the tag', () => {
    const result = addCronTag('job-1', 'WEEKLY')
    expect(result).toEqual(['weekly'])
  })

  it('addCronTag deduplicates (case-insensitive via lowercase)', () => {
    addCronTag('job-1', 'critical')
    const result = addCronTag('job-1', 'CRITICAL')
    expect(result).toEqual(['critical'])
  })

  it('addCronTag ignores blank tag', () => {
    const result = addCronTag('job-1', '   ')
    expect(result).toEqual([])
  })

  it('addCronTag accumulates multiple distinct tags', () => {
    addCronTag('job-1', 'critical')
    const result = addCronTag('job-1', 'weekly')
    expect(result).toEqual(['critical', 'weekly'])
  })

  // -------------------------------------------------------------------------
  // removeCronTag
  // -------------------------------------------------------------------------

  it('removeCronTag removes the specified tag', () => {
    saveCronTags('job-1', ['critical', 'weekly'])
    const result = removeCronTag('job-1', 'critical')
    expect(result).toEqual(['weekly'])
    expect(loadCronTags('job-1')).toEqual(['weekly'])
  })

  it('removeCronTag is a no-op when tag absent', () => {
    saveCronTags('job-1', ['weekly'])
    const result = removeCronTag('job-1', 'critical')
    expect(result).toEqual(['weekly'])
  })

  it('removeCronTag removes key from localStorage when list becomes empty', () => {
    saveCronTags('job-1', ['only'])
    removeCronTag('job-1', 'only')
    expect(loadCronTags('job-1')).toEqual([])
  })

  // -------------------------------------------------------------------------
  // loadAllCronTags
  // -------------------------------------------------------------------------

  it('loadAllCronTags returns empty map when nothing stored', () => {
    expect(loadAllCronTags().size).toBe(0)
  })

  it('loadAllCronTags aggregates across multiple jobs', () => {
    saveCronTags('job-1', ['critical'])
    saveCronTags('job-2', ['weekly', 'critical'])
    const map = loadAllCronTags()
    expect(map.get('job-1')).toEqual(['critical'])
    expect(map.get('job-2')).toEqual(['weekly', 'critical'])
  })

  it('loadAllCronTags ignores other oc_* keys', () => {
    vi.stubGlobal(
      'localStorage',
      makeLocalStorageStub({
        'oc_session_bookmarks:agent-x': JSON.stringify(['s1']),
        'oc_cron_tags:job-1': JSON.stringify(['critical']),
        other_key: 'value',
      }),
    )
    const map = loadAllCronTags()
    expect(map.size).toBe(1)
    expect(map.has('job-1')).toBe(true)
  })

  it('loadAllCronTags excludes jobs with no tags', () => {
    saveCronTags('job-1', ['critical'])
    saveCronTags('job-2', []) // triggers removeItem
    const map = loadAllCronTags()
    expect(map.has('job-1')).toBe(true)
    expect(map.has('job-2')).toBe(false)
  })

  // -------------------------------------------------------------------------
  // uniqueCronTags
  // -------------------------------------------------------------------------

  it('uniqueCronTags returns empty array for empty map', () => {
    expect(uniqueCronTags(new Map())).toEqual([])
  })

  it('uniqueCronTags counts and sorts by count desc, alpha tiebreak', () => {
    const map = new Map<string, string[]>([
      ['job-1', ['critical', 'weekly']],
      ['job-2', ['critical', 'daily']],
      ['job-3', ['weekly']],
    ])
    const result = uniqueCronTags(map)
    // critical: 2, weekly: 2, daily: 1
    // critical and weekly tie → alphabetical
    expect(result).toEqual([
      { tag: 'critical', count: 2 },
      { tag: 'weekly', count: 2 },
      { tag: 'daily', count: 1 },
    ])
  })

  it('uniqueCronTags handles single job single tag', () => {
    const map = new Map<string, string[]>([['job-1', ['nightly']]])
    expect(uniqueCronTags(map)).toEqual([{ tag: 'nightly', count: 1 }])
  })

  // -------------------------------------------------------------------------
  // filterJobsByTag
  // -------------------------------------------------------------------------

  it('filterJobsByTag(null) returns all jobs', () => {
    const jobs = [{ id: 'job-1' }, { id: 'job-2' }]
    const map = new Map<string, string[]>([['job-1', ['critical']]])
    expect(filterJobsByTag(jobs, map, null)).toEqual(jobs)
  })

  it('filterJobsByTag filters to only matching jobs', () => {
    const jobs = [{ id: 'job-1' }, { id: 'job-2' }, { id: 'job-3' }]
    const map = new Map<string, string[]>([
      ['job-1', ['critical']],
      ['job-2', ['weekly']],
      ['job-3', ['critical', 'weekly']],
    ])
    const result = filterJobsByTag(jobs, map, 'critical')
    expect(result.map((j) => j.id)).toEqual(['job-1', 'job-3'])
  })

  it('filterJobsByTag returns empty when no job matches tag', () => {
    const jobs = [{ id: 'job-1' }]
    const map = new Map<string, string[]>([['job-1', ['weekly']]])
    expect(filterJobsByTag(jobs, map, 'critical')).toEqual([])
  })

  it('filterJobsByTag handles job with no tags in map', () => {
    const jobs = [{ id: 'job-1' }, { id: 'job-2' }]
    const map = new Map<string, string[]>([['job-1', ['critical']]])
    // job-2 not in map at all
    const result = filterJobsByTag(jobs, map, 'critical')
    expect(result.map((j) => j.id)).toEqual(['job-1'])
  })

  // -------------------------------------------------------------------------
  // per-job isolation
  // -------------------------------------------------------------------------

  it('tags for different jobs are stored independently', () => {
    addCronTag('job-a', 'alpha')
    addCronTag('job-b', 'beta')
    expect(loadCronTags('job-a')).toEqual(['alpha'])
    expect(loadCronTags('job-b')).toEqual(['beta'])
    removeCronTag('job-a', 'alpha')
    expect(loadCronTags('job-a')).toEqual([])
    expect(loadCronTags('job-b')).toEqual(['beta'])
  })
})
