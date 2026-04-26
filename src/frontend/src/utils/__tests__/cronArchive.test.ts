import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  loadArchived,
  saveArchived,
  archiveJob,
  unarchiveJob,
  isArchived,
} from '../cronArchive'

const KEY = 'oc_cron_archived'

function makeLocalStorageStub(seed: Record<string, string> = {}): Storage {
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

describe('cronArchive', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeLocalStorageStub())
  })

  it('loadArchived returns empty Set when nothing is stored', () => {
    const result = loadArchived()
    expect(result).toBeInstanceOf(Set)
    expect(result.size).toBe(0)
  })

  it('loadArchived returns empty Set on corrupt JSON', () => {
    vi.stubGlobal('localStorage', makeLocalStorageStub({ [KEY]: '{not json' }))
    const result = loadArchived()
    expect(result).toBeInstanceOf(Set)
    expect(result.size).toBe(0)
  })

  it('loadArchived returns empty Set when stored value is not an array', () => {
    vi.stubGlobal('localStorage', makeLocalStorageStub({ [KEY]: JSON.stringify({ a: 1 }) }))
    const result = loadArchived()
    expect(result.size).toBe(0)
  })

  it('loadArchived filters out non-string entries', () => {
    vi.stubGlobal(
      'localStorage',
      makeLocalStorageStub({ [KEY]: JSON.stringify(['job-1', 42, null, 'job-2', true]) }),
    )
    const result = loadArchived()
    expect(result.size).toBe(2)
    expect(result.has('job-1')).toBe(true)
    expect(result.has('job-2')).toBe(true)
  })

  it('saveArchived + loadArchived round-trip preserves all ids', () => {
    const original = new Set(['a', 'b', 'c'])
    saveArchived(original)
    const loaded = loadArchived()
    expect(loaded.size).toBe(3)
    expect(loaded.has('a')).toBe(true)
    expect(loaded.has('b')).toBe(true)
    expect(loaded.has('c')).toBe(true)
  })

  it('archiveJob adds the id and subsequent loadArchived reflects it', () => {
    const next = archiveJob('cron-1')
    expect(next.has('cron-1')).toBe(true)
    const loaded = loadArchived()
    expect(loaded.has('cron-1')).toBe(true)
  })

  it('archiveJob of the same id is idempotent (no duplicates)', () => {
    archiveJob('cron-x')
    const second = archiveJob('cron-x')
    expect(second.size).toBe(1)
    expect(second.has('cron-x')).toBe(true)
    expect(loadArchived().size).toBe(1)
  })

  it('unarchiveJob removes the id and subsequent loadArchived reflects it', () => {
    archiveJob('cron-2')
    const next = unarchiveJob('cron-2')
    expect(next.has('cron-2')).toBe(false)
    const loaded = loadArchived()
    expect(loaded.has('cron-2')).toBe(false)
  })

  it('unarchiveJob for a non-existent id is a no-op', () => {
    archiveJob('cron-3')
    const before = loadArchived().size
    const next = unarchiveJob('cron-nonexistent')
    expect(next.size).toBe(before)
    expect(next.has('cron-3')).toBe(true)
  })

  it('isArchived returns true when id is in set and false otherwise', () => {
    const set = new Set(['id-yes'])
    expect(isArchived(set, 'id-yes')).toBe(true)
    expect(isArchived(set, 'id-no')).toBe(false)
  })

  it('archiveJob does not mutate the previously loaded set', () => {
    const initial = loadArchived()
    archiveJob('cron-4')
    expect(initial.has('cron-4')).toBe(false)
  })
})
