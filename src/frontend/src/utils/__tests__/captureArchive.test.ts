import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  loadArchived,
  saveArchived,
  archiveCapture,
  unarchiveCapture,
  isArchived,
} from '../captureArchive'

const KEY = 'oc_capture_archived'

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

describe('captureArchive', () => {
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
      makeLocalStorageStub({ [KEY]: JSON.stringify(['id-1', 42, null, 'id-2', true]) }),
    )
    const result = loadArchived()
    expect(result.size).toBe(2)
    expect(result.has('id-1')).toBe(true)
    expect(result.has('id-2')).toBe(true)
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

  it('archiveCapture adds the id and subsequent loadArchived reflects it', () => {
    const next = archiveCapture('cap-1')
    expect(next.has('cap-1')).toBe(true)
    const loaded = loadArchived()
    expect(loaded.has('cap-1')).toBe(true)
  })

  it('archiveCapture of the same id is idempotent', () => {
    archiveCapture('cap-x')
    const second = archiveCapture('cap-x')
    expect(second.size).toBe(1)
    expect(second.has('cap-x')).toBe(true)
    expect(loadArchived().size).toBe(1)
  })

  it('unarchiveCapture removes the id and subsequent loadArchived reflects it', () => {
    archiveCapture('cap-2')
    const next = unarchiveCapture('cap-2')
    expect(next.has('cap-2')).toBe(false)
    const loaded = loadArchived()
    expect(loaded.has('cap-2')).toBe(false)
  })

  it('unarchiveCapture for a non-existent id is a no-op', () => {
    archiveCapture('cap-3')
    const before = loadArchived().size
    const next = unarchiveCapture('cap-nonexistent')
    expect(next.size).toBe(before)
    expect(next.has('cap-3')).toBe(true)
  })

  it('isArchived returns true when id is in set and false otherwise', () => {
    const set = new Set(['id-yes'])
    expect(isArchived(set, 'id-yes')).toBe(true)
    expect(isArchived(set, 'id-no')).toBe(false)
  })
})
