import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  loadHistory,
  saveHistory,
  recordCommand,
  clearHistory,
  pickRecents,
} from '../commandHistory'

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

describe('commandHistory', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeLocalStorageStub())
  })

  it('loadHistory returns [] when nothing stored', () => {
    expect(loadHistory()).toEqual([])
  })

  it('loadHistory returns [] on corrupt JSON', () => {
    vi.stubGlobal('localStorage', makeLocalStorageStub({ oc_command_history: '{not json' }))
    expect(loadHistory()).toEqual([])
  })

  it('loadHistory filters non-string entries', () => {
    vi.stubGlobal(
      'localStorage',
      makeLocalStorageStub({
        oc_command_history: JSON.stringify(['a', 42, null, 'b', true]),
      }),
    )
    expect(loadHistory()).toEqual(['a', 'b'])
  })

  it('saveHistory + loadHistory round-trip preserves order', () => {
    saveHistory(['x', 'y', 'z'])
    expect(loadHistory()).toEqual(['x', 'y', 'z'])
  })

  it('recordCommand adds new command to front', () => {
    const result = recordCommand('a')
    expect(result).toEqual(['a'])
    expect(loadHistory()).toEqual(['a'])
  })

  it('recordCommand moves existing id to front (dedupe)', () => {
    saveHistory(['b', 'a'])
    const result = recordCommand('a')
    expect(result).toEqual(['a', 'b'])
    expect(loadHistory()).toEqual(['a', 'b'])
  })

  it('recordCommand does not duplicate the same id', () => {
    recordCommand('a')
    recordCommand('a')
    expect(loadHistory()).toEqual(['a'])
  })

  it('recordCommand caps at 10 — 11th entry drops the oldest', () => {
    for (let i = 1; i <= 10; i++) {
      recordCommand(`cmd-${i}`)
    }
    // history is now ['cmd-10', 'cmd-9', ..., 'cmd-1']
    expect(loadHistory()).toHaveLength(10)
    // add an 11th unique command
    recordCommand('cmd-11')
    const history = loadHistory()
    expect(history).toHaveLength(10)
    // oldest (cmd-1) should have been dropped
    expect(history).not.toContain('cmd-1')
    expect(history[0]).toBe('cmd-11')
  })

  it('clearHistory empties storage — loadHistory returns [] after', () => {
    saveHistory(['a', 'b', 'c'])
    clearHistory()
    expect(loadHistory()).toEqual([])
  })

  it('pickRecents order matches history order', () => {
    const commands = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    const result = pickRecents(commands, ['c', 'a'])
    expect(result.map((c) => c.id)).toEqual(['c', 'a'])
  })

  it('pickRecents filters out IDs not present in commands array', () => {
    const commands = [{ id: 'a' }, { id: 'b' }]
    const result = pickRecents(commands, ['a', 'deleted-cmd', 'b'])
    expect(result.map((c) => c.id)).toEqual(['a', 'b'])
  })
})
