import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  loadBookmarks,
  saveBookmarks,
  toggleBookmark,
  isBookmarked,
  partition,
} from '../sessionBookmarks'

function makeLocalStorageStub(seed: Record<string, string> = {}) {
  const store: Record<string, string> = { ...seed }
  return {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => { store[k] = String(v) },
    removeItem: (k: string) => { delete store[k] },
    clear: () => { for (const k of Object.keys(store)) delete store[k] },
    key: (i: number) => Object.keys(store)[i] ?? null,
    get length() { return Object.keys(store).length },
  } as Storage
}

describe('sessionBookmarks', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeLocalStorageStub())
  })

  it('loadBookmarks returns empty array when nothing stored', () => {
    expect(loadBookmarks('agent-x')).toEqual([])
  })

  it('save + load round-trip preserves order', () => {
    saveBookmarks('agent-x', ['s1', 's2', 's3'])
    expect(loadBookmarks('agent-x')).toEqual(['s1', 's2', 's3'])
  })

  it('toggleBookmark adds when missing', () => {
    const result = toggleBookmark('agent-x', 's1')
    expect(result).toEqual(['s1'])
    expect(loadBookmarks('agent-x')).toEqual(['s1'])
  })

  it('toggleBookmark removes when present', () => {
    saveBookmarks('agent-x', ['s1', 's2'])
    const result = toggleBookmark('agent-x', 's1')
    expect(result).toEqual(['s2'])
    expect(loadBookmarks('agent-x')).toEqual(['s2'])
  })

  it('loadBookmarks falls back to [] on corrupt JSON', () => {
    vi.stubGlobal('localStorage', makeLocalStorageStub({ 'oc_session_bookmarks:agent-x': '{not json' }))
    expect(loadBookmarks('agent-x')).toEqual([])
  })

  it('loadBookmarks filters non-string entries', () => {
    vi.stubGlobal('localStorage', makeLocalStorageStub({
      'oc_session_bookmarks:agent-x': JSON.stringify(['s1', 42, null, 's2']),
    }))
    expect(loadBookmarks('agent-x')).toEqual(['s1', 's2'])
  })

  it('isBookmarked checks membership', () => {
    expect(isBookmarked(['s1', 's2'], 's2')).toBe(true)
    expect(isBookmarked(['s1', 's2'], 's3')).toBe(false)
  })

  it('partition splits items into pinned vs rest', () => {
    const items = [
      { id: 's1' },
      { id: 's2' },
      { id: 's3' },
      { id: 's4' },
    ]
    const result = partition(items, ['s3', 's1'])
    expect(result.pinned.map((x) => x.id)).toEqual(['s3', 's1'])
    expect(result.rest.map((x) => x.id)).toEqual(['s2', 's4'])
  })

  it('partition preserves bookmark click order in pinned', () => {
    const items = [
      { id: 'a' },
      { id: 'b' },
      { id: 'c' },
    ]
    // bookmark order: c then a → pinned should be [c, a]
    const result = partition(items, ['c', 'a'])
    expect(result.pinned.map((x) => x.id)).toEqual(['c', 'a'])
  })

  it('partition handles empty bookmarks', () => {
    const items = [{ id: 's1' }, { id: 's2' }]
    const result = partition(items, [])
    expect(result.pinned).toEqual([])
    expect(result.rest).toEqual(items)
  })

  it('per-agent isolation: bookmarks for one agent do not leak', () => {
    saveBookmarks('agent-a', ['s1'])
    saveBookmarks('agent-b', ['s2'])
    expect(loadBookmarks('agent-a')).toEqual(['s1'])
    expect(loadBookmarks('agent-b')).toEqual(['s2'])
  })
})
