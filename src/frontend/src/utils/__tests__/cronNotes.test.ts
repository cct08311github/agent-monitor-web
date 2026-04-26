import { describe, it, expect, beforeEach, vi } from 'vitest'
import { loadCronNote, saveCronNote, clearCronNote } from '../cronNotes'

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

describe('cronNotes', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeLocalStorageStub())
  })

  it('loadCronNote returns null when nothing stored', () => {
    expect(loadCronNote('job-x')).toBeNull()
  })

  it('saveCronNote then loadCronNote round-trip preserves text and updatedAt', () => {
    const ts = 1_700_000_000_000
    saveCronNote('job-x', 'hello world', ts)
    const result = loadCronNote('job-x')
    expect(result).not.toBeNull()
    expect(result?.text).toBe('hello world')
    expect(result?.updatedAt).toBe(ts)
  })

  it('loadCronNote returns null on corrupt JSON', () => {
    vi.stubGlobal(
      'localStorage',
      makeLocalStorageStub({ 'oc_cron_notes:job-x': '{not json' }),
    )
    expect(loadCronNote('job-x')).toBeNull()
  })

  it('loadCronNote returns null on shape mismatch — text is not a string', () => {
    vi.stubGlobal(
      'localStorage',
      makeLocalStorageStub({
        'oc_cron_notes:job-x': JSON.stringify({ text: 42, updatedAt: 1234567890 }),
      }),
    )
    expect(loadCronNote('job-x')).toBeNull()
  })

  it('loadCronNote returns null on shape mismatch — updatedAt is not a number', () => {
    vi.stubGlobal(
      'localStorage',
      makeLocalStorageStub({
        'oc_cron_notes:job-x': JSON.stringify({ text: 'hi', updatedAt: 'not-a-number' }),
      }),
    )
    expect(loadCronNote('job-x')).toBeNull()
  })

  it('clearCronNote removes the entry → loadCronNote returns null', () => {
    saveCronNote('job-x', 'some note', 1_000_000)
    clearCronNote('job-x')
    expect(loadCronNote('job-x')).toBeNull()
  })

  it('per-job isolation: saving for job A does not affect job B', () => {
    saveCronNote('job-a', 'note for A', 1_000_000)
    saveCronNote('job-b', 'note for B', 2_000_000)
    expect(loadCronNote('job-a')?.text).toBe('note for A')
    expect(loadCronNote('job-b')?.text).toBe('note for B')
  })

  it('explicit now timestamp is respected', () => {
    const fixedTs = 9_999_999_999
    const note = saveCronNote('job-x', 'timestamped', fixedTs)
    expect(note.updatedAt).toBe(fixedTs)
    expect(loadCronNote('job-x')?.updatedAt).toBe(fixedTs)
  })

  it('empty string is a valid note value', () => {
    saveCronNote('job-x', '', 1_000_000)
    const result = loadCronNote('job-x')
    expect(result).not.toBeNull()
    expect(result?.text).toBe('')
  })

  it('uses oc_cron_notes: key prefix (isolated from agent notes namespace)', () => {
    const ls = makeLocalStorageStub()
    vi.stubGlobal('localStorage', ls)
    saveCronNote('shared-id', 'cron note', 1_000_000)
    // agent notes key would be oc_agent_notes:shared-id — must not exist
    expect(ls.getItem('oc_agent_notes:shared-id')).toBeNull()
    // cron notes key must exist
    expect(ls.getItem('oc_cron_notes:shared-id')).not.toBeNull()
  })
})
