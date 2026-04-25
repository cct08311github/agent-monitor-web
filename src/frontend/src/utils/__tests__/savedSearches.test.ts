import { describe, it, expect, beforeEach, vi } from 'vitest'
import { loadSearches, saveSearch, deleteSearch, findByName } from '../savedSearches'
import type { SavedSearch } from '../savedSearches'

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

const LS_KEY = 'oc_saved_log_searches'

describe('savedSearches', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeLocalStorageStub())
  })

  // ------------------------------------------------------------------
  // loadSearches
  // ------------------------------------------------------------------

  it('loadSearches returns [] when key is absent', () => {
    expect(loadSearches()).toEqual([])
  })

  it('loadSearches returns [] on corrupt JSON', () => {
    vi.stubGlobal(
      'localStorage',
      makeLocalStorageStub({ [LS_KEY]: '{not valid json' }),
    )
    expect(loadSearches()).toEqual([])
  })

  it('loadSearches returns [] when stored value is not an array', () => {
    vi.stubGlobal(
      'localStorage',
      makeLocalStorageStub({ [LS_KEY]: JSON.stringify({ id: 'x' }) }),
    )
    expect(loadSearches()).toEqual([])
  })

  it('loadSearches filters entries that are missing required fields', () => {
    const invalid = [
      { id: 'a', name: 'A' }, // missing query + createdAt
      { id: 'b', name: 'B', query: 'foo' }, // missing createdAt
      { id: 'c', name: 'C', query: 'bar', createdAt: 1000 }, // valid
    ]
    vi.stubGlobal(
      'localStorage',
      makeLocalStorageStub({ [LS_KEY]: JSON.stringify(invalid) }),
    )
    const result = loadSearches()
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('c')
  })

  it('loadSearches filters entries with wrong field types', () => {
    const wrong = [
      { id: 42, name: 'bad id type', query: 'x', createdAt: 1000 }, // id should be string
      { id: 'ok', name: 'good', query: 'q', createdAt: 1000 }, // valid
    ]
    vi.stubGlobal(
      'localStorage',
      makeLocalStorageStub({ [LS_KEY]: JSON.stringify(wrong) }),
    )
    const result = loadSearches()
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('ok')
  })

  // ------------------------------------------------------------------
  // saveSearch
  // ------------------------------------------------------------------

  it('saveSearch returns entry with generated id and createdAt', () => {
    const entry = saveSearch({ name: 'test', query: 'error' })
    expect(typeof entry.id).toBe('string')
    expect(entry.id.startsWith('s_')).toBe(true)
    expect(typeof entry.createdAt).toBe('number')
    expect(entry.name).toBe('test')
    expect(entry.query).toBe('error')
  })

  it('saveSearch round-trip: loadSearches includes the new entry', () => {
    saveSearch({ name: 'my search', query: 'warn' })
    const all = loadSearches()
    expect(all).toHaveLength(1)
    expect(all[0].name).toBe('my search')
    expect(all[0].query).toBe('warn')
  })

  it('saveSearch with same name (case-insensitive) overwrites instead of duplicating', () => {
    saveSearch({ name: 'Errors', query: 'error v1' })
    saveSearch({ name: 'errors', query: 'error v2' }) // same name, different case
    const all = loadSearches()
    expect(all).toHaveLength(1)
    expect(all[0].query).toBe('error v2')
  })

  it('saveSearch preserves optional level and agentId fields', () => {
    const entry = saveSearch({ name: 'filtered', query: 'timeout', level: 'error', agentId: 'agent-1' })
    expect(entry.level).toBe('error')
    expect(entry.agentId).toBe('agent-1')
    const loaded = loadSearches()
    expect(loaded[0].level).toBe('error')
    expect(loaded[0].agentId).toBe('agent-1')
  })

  it('saveSearch multiple entries accumulates all', () => {
    saveSearch({ name: 'A', query: 'alpha' })
    saveSearch({ name: 'B', query: 'beta' })
    saveSearch({ name: 'C', query: 'gamma' })
    expect(loadSearches()).toHaveLength(3)
  })

  // ------------------------------------------------------------------
  // deleteSearch
  // ------------------------------------------------------------------

  it('deleteSearch removes the entry by id', () => {
    const entry = saveSearch({ name: 'to delete', query: 'bye' })
    deleteSearch(entry.id)
    const all = loadSearches()
    expect(all.find((s: SavedSearch) => s.id === entry.id)).toBeUndefined()
  })

  it('deleteSearch with a non-existent id does not throw', () => {
    saveSearch({ name: 'keep', query: 'stay' })
    expect(() => deleteSearch('non-existent-id')).not.toThrow()
    expect(loadSearches()).toHaveLength(1)
  })

  // ------------------------------------------------------------------
  // findByName
  // ------------------------------------------------------------------

  it('findByName returns the matching entry (case-insensitive)', () => {
    saveSearch({ name: 'My Search', query: 'hello' })
    const found = findByName('my search')
    expect(found).toBeDefined()
    expect(found?.query).toBe('hello')
  })

  it('findByName returns undefined for a missing name', () => {
    saveSearch({ name: 'existing', query: 'data' })
    expect(findByName('nope')).toBeUndefined()
  })
})
