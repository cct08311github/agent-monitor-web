import { describe, it, expect } from 'vitest'
import { filterSessionsByQuery, type SearchableSession } from '../sessionSearchFilter'

interface TestSession extends SearchableSession {
  extra?: string
}

const sessions: TestSession[] = [
  {
    id: 'abc123def456',
    preview: 'Refactor authentication module',
    firstMessage: 'Please help me refactor auth',
    title: 'Auth Refactor',
  },
  {
    id: 'xyz789ghi012',
    preview: 'Fix memory leak in dashboard',
    firstMessage: null,
    title: null,
  },
  {
    id: 'qrs345tuv678',
    preview: null,
    firstMessage: 'Deploy to production server',
    title: 'Production Deploy',
  },
  {
    id: 'lmn901opq234',
    preview: 'Update dependencies and run tests',
    firstMessage: 'npm update all packages',
    title: null,
  },
]

describe('filterSessionsByQuery', () => {
  it('empty query returns all sessions (unfiltered copy)', () => {
    const result = filterSessionsByQuery(sessions, '')
    expect(result).toHaveLength(sessions.length)
    expect(result.map((s) => s.id)).toEqual(sessions.map((s) => s.id))
  })

  it('whitespace-only query returns all sessions', () => {
    const result = filterSessionsByQuery(sessions, '   ')
    expect(result).toHaveLength(sessions.length)
  })

  it('matches by id field', () => {
    const result = filterSessionsByQuery(sessions, 'abc123')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('abc123def456')
  })

  it('matches by preview field', () => {
    const result = filterSessionsByQuery(sessions, 'memory leak')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('xyz789ghi012')
  })

  it('matches by firstMessage field', () => {
    const result = filterSessionsByQuery(sessions, 'Deploy to production')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('qrs345tuv678')
  })

  it('matches by title field', () => {
    const result = filterSessionsByQuery(sessions, 'Auth Refactor')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('abc123def456')
  })

  it('is case-insensitive', () => {
    const result = filterSessionsByQuery(sessions, 'PRODUCTION DEPLOY')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('qrs345tuv678')
  })

  it('session with all null/undefined optional fields is not matched (only id checked)', () => {
    const nullSession: TestSession[] = [
      { id: 'null-session-id', preview: null, firstMessage: null, title: null },
    ]
    // 'zzz' should not match 'null-session-id'
    const result = filterSessionsByQuery(nullSession, 'zzz')
    expect(result).toHaveLength(0)
  })

  it('session with all null optional fields matches on id', () => {
    const nullSession: TestSession[] = [
      { id: 'null-session-id', preview: null, firstMessage: null, title: null },
    ]
    const result = filterSessionsByQuery(nullSession, 'null-session')
    expect(result).toHaveLength(1)
  })

  it('fuzzy partial match on id', () => {
    // 'lmn901' fuzzy matches 'lmn901opq234'
    const result = filterSessionsByQuery(sessions, 'lmn901')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('lmn901opq234')
  })

  it('no match returns empty array', () => {
    const result = filterSessionsByQuery(sessions, 'zzzzzzz')
    expect(result).toHaveLength(0)
  })

  it('does not mutate the original array', () => {
    const original = [...sessions]
    filterSessionsByQuery(sessions, 'auth')
    expect(sessions).toEqual(original)
    expect(sessions).toHaveLength(original.length)
  })

  it('query matching multiple fields returns session once (no duplicates)', () => {
    // 'auth' matches both preview and title of the first session; should appear once
    const result = filterSessionsByQuery(sessions, 'auth')
    const firstMatch = result.filter((s) => s.id === 'abc123def456')
    expect(firstMatch).toHaveLength(1)
  })

  it('preserves original order of matching sessions', () => {
    // 'e' is broad enough to match multiple sessions; order should mirror source
    const result = filterSessionsByQuery(sessions, 'update')
    const ids = result.map((s) => s.id)
    const originalOrder = sessions
      .filter((s) => ids.includes(s.id))
      .map((s) => s.id)
    expect(ids).toEqual(originalOrder)
  })
})
