import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  loadCronAlias,
  saveCronAlias,
  clearCronAlias,
  loadAllCronAliases,
  displayCronJobName,
} from '../cronAliases'

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

describe('cronAliases', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeLocalStorageStub())
  })

  it('loadCronAlias returns null when nothing stored', () => {
    expect(loadCronAlias('job-x')).toBeNull()
  })

  it('saveCronAlias + loadCronAlias round-trip preserves value', () => {
    saveCronAlias('job-x', 'My Cron Job')
    expect(loadCronAlias('job-x')).toBe('My Cron Job')
  })

  it('saveCronAlias with empty string removes the entry', () => {
    saveCronAlias('job-x', 'My Cron Job')
    saveCronAlias('job-x', '')
    expect(loadCronAlias('job-x')).toBeNull()
  })

  it('saveCronAlias with whitespace-only string treated as empty (removes entry)', () => {
    saveCronAlias('job-x', 'My Cron Job')
    saveCronAlias('job-x', '   ')
    expect(loadCronAlias('job-x')).toBeNull()
  })

  it('clearCronAlias removes the entry', () => {
    saveCronAlias('job-x', 'My Cron Job')
    clearCronAlias('job-x')
    expect(loadCronAlias('job-x')).toBeNull()
  })

  it('loadAllCronAliases returns all stored aliases as a Map', () => {
    saveCronAlias('job-a', 'Alpha Job')
    saveCronAlias('job-b', 'Beta Job')
    const map = loadAllCronAliases()
    expect(map.size).toBe(2)
    expect(map.get('job-a')).toBe('Alpha Job')
    expect(map.get('job-b')).toBe('Beta Job')
  })

  it('loadAllCronAliases ignores non-cron-alias keys (e.g. oc_agent_alias:foo)', () => {
    saveCronAlias('job-a', 'Alpha Job')
    localStorage.setItem('oc_agent_alias:job-a', 'some-agent-alias')
    localStorage.setItem('oc_session_bookmarks:job-a', '["s1"]')
    localStorage.setItem('other_key', 'value')
    const map = loadAllCronAliases()
    expect(map.size).toBe(1)
    expect(map.has('job-a')).toBe(true)
  })

  it('per-job isolation: setting job-a does not affect job-b', () => {
    saveCronAlias('job-a', 'Alpha Job')
    expect(loadCronAlias('job-b')).toBeNull()
  })

  describe('displayCronJobName', () => {
    it('alias takes precedence over fallback and id', () => {
      expect(displayCronJobName('my-job', 'MyAlias', 'FallbackName')).toBe('MyAlias')
    })

    it('fallback used when alias is null', () => {
      expect(displayCronJobName('my-job', null, 'FallbackName')).toBe('FallbackName')
    })

    it('id used when alias and fallback are both null', () => {
      expect(displayCronJobName('my-job', null, null)).toBe('my-job')
    })

    it('whitespace-only alias falls through to fallback', () => {
      expect(displayCronJobName('my-job', '   ', 'FallbackName')).toBe('FallbackName')
    })

    it('whitespace-only alias and null fallback falls through to id', () => {
      expect(displayCronJobName('my-job', '   ', null)).toBe('my-job')
    })

    it('undefined alias falls through to fallback', () => {
      expect(displayCronJobName('my-job', undefined, 'FallbackName')).toBe('FallbackName')
    })

    it('alias trimmed before returning', () => {
      expect(displayCronJobName('my-job', '  trimmed  ', null)).toBe('trimmed')
    })
  })
})
