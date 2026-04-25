import { describe, it, expect, beforeEach, vi } from 'vitest'
import { loadNote, saveNote, clearNote } from '../agentNotes'

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

describe('agentNotes', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeLocalStorageStub())
  })

  it('loadNote returns null when nothing stored', () => {
    expect(loadNote('agent-x')).toBeNull()
  })

  it('saveNote then loadNote round-trip preserves text and updatedAt', () => {
    const ts = 1_700_000_000_000
    saveNote('agent-x', 'hello world', ts)
    const result = loadNote('agent-x')
    expect(result).not.toBeNull()
    expect(result?.text).toBe('hello world')
    expect(result?.updatedAt).toBe(ts)
  })

  it('loadNote returns null on corrupt JSON', () => {
    vi.stubGlobal(
      'localStorage',
      makeLocalStorageStub({ 'oc_agent_notes:agent-x': '{not json' }),
    )
    expect(loadNote('agent-x')).toBeNull()
  })

  it('loadNote returns null when text field is not a string', () => {
    vi.stubGlobal(
      'localStorage',
      makeLocalStorageStub({
        'oc_agent_notes:agent-x': JSON.stringify({ text: 42, updatedAt: 1234567890 }),
      }),
    )
    expect(loadNote('agent-x')).toBeNull()
  })

  it('loadNote returns null when updatedAt field is not a number', () => {
    vi.stubGlobal(
      'localStorage',
      makeLocalStorageStub({
        'oc_agent_notes:agent-x': JSON.stringify({ text: 'hi', updatedAt: 'not-a-number' }),
      }),
    )
    expect(loadNote('agent-x')).toBeNull()
  })

  it('clearNote removes the entry → loadNote returns null', () => {
    saveNote('agent-x', 'some note', 1_000_000)
    clearNote('agent-x')
    expect(loadNote('agent-x')).toBeNull()
  })

  it('per-agent isolation: saving for agent A does not affect agent B', () => {
    saveNote('agent-a', 'note for A', 1_000_000)
    saveNote('agent-b', 'note for B', 2_000_000)
    expect(loadNote('agent-a')?.text).toBe('note for A')
    expect(loadNote('agent-b')?.text).toBe('note for B')
  })

  it('saveNote with explicit now uses that timestamp', () => {
    const fixedTs = 9_999_999_999
    const note = saveNote('agent-x', 'timestamped', fixedTs)
    expect(note.updatedAt).toBe(fixedTs)
    expect(loadNote('agent-x')?.updatedAt).toBe(fixedTs)
  })

  it('empty string is a valid note value', () => {
    saveNote('agent-x', '', 1_000_000)
    const result = loadNote('agent-x')
    expect(result).not.toBeNull()
    expect(result?.text).toBe('')
  })
})
