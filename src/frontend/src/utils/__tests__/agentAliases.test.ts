import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  loadAlias,
  saveAlias,
  clearAlias,
  loadAllAliases,
  displayAgentName,
} from '../agentAliases'

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

describe('agentAliases', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeLocalStorageStub())
  })

  it('loadAlias returns null when nothing stored', () => {
    expect(loadAlias('agent-x')).toBeNull()
  })

  it('saveAlias + loadAlias round-trip preserves value', () => {
    saveAlias('agent-x', 'My Worker')
    expect(loadAlias('agent-x')).toBe('My Worker')
  })

  it('saveAlias with empty string removes the entry', () => {
    saveAlias('agent-x', 'My Worker')
    saveAlias('agent-x', '')
    expect(loadAlias('agent-x')).toBeNull()
  })

  it('saveAlias with whitespace-only string treated as empty (removes entry)', () => {
    saveAlias('agent-x', 'My Worker')
    saveAlias('agent-x', '   ')
    expect(loadAlias('agent-x')).toBeNull()
  })

  it('clearAlias removes the entry', () => {
    saveAlias('agent-x', 'My Worker')
    clearAlias('agent-x')
    expect(loadAlias('agent-x')).toBeNull()
  })

  it('loadAllAliases returns all stored aliases as a Map', () => {
    saveAlias('agent-a', 'Alpha')
    saveAlias('agent-b', 'Beta')
    const map = loadAllAliases()
    expect(map.size).toBe(2)
    expect(map.get('agent-a')).toBe('Alpha')
    expect(map.get('agent-b')).toBe('Beta')
  })

  it('loadAllAliases ignores non-alias keys (e.g. oc_session_bookmarks:foo)', () => {
    saveAlias('agent-a', 'Alpha')
    localStorage.setItem('oc_session_bookmarks:agent-a', '["s1"]')
    localStorage.setItem('other_key', 'value')
    const map = loadAllAliases()
    expect(map.size).toBe(1)
    expect(map.has('agent-a')).toBe(true)
  })

  it('per-agent isolation: setting A does not affect B', () => {
    saveAlias('agent-a', 'Alpha')
    expect(loadAlias('agent-b')).toBeNull()
  })

  describe('displayAgentName', () => {
    it('alias takes precedence over fallback and id', () => {
      expect(displayAgentName('my-id', 'MyAlias', 'FallbackName')).toBe('MyAlias')
    })

    it('fallback used when alias is null', () => {
      expect(displayAgentName('my-id', null, 'FallbackName')).toBe('FallbackName')
    })

    it('id used when alias and fallback are both null', () => {
      expect(displayAgentName('my-id', null, null)).toBe('my-id')
    })

    it('whitespace-only alias falls through to fallback', () => {
      expect(displayAgentName('my-id', '   ', 'FallbackName')).toBe('FallbackName')
    })

    it('whitespace-only alias and null fallback falls through to id', () => {
      expect(displayAgentName('my-id', '   ', null)).toBe('my-id')
    })

    it('undefined alias falls through to fallback', () => {
      expect(displayAgentName('my-id', undefined, 'FallbackName')).toBe('FallbackName')
    })

    it('alias trimmed before returning', () => {
      expect(displayAgentName('my-id', '  trimmed  ', null)).toBe('trimmed')
    })
  })
})
