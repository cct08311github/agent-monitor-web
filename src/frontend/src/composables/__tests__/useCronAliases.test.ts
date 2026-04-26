import { describe, it, expect, beforeEach, vi } from 'vitest'

// The composable module has module-scoped state. We need to reset it between
// tests by mocking localStorage before each test then re-importing.

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

describe('useCronAliases', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeLocalStorageStub())
    // Reset module-scoped state by re-importing
    vi.resetModules()
  })

  it('setAlias updates aliases reactive map', async () => {
    const { useCronAliases } = await import('../useCronAliases')
    const { aliases, setAlias, getAlias } = useCronAliases()

    expect(getAlias('job-a')).toBeNull()

    setAlias('job-a', 'My Cron Job')

    expect(getAlias('job-a')).toBe('My Cron Job')
    expect(aliases.value.get('job-a')).toBe('My Cron Job')
  })

  it('clearAlias removes from reactive map and localStorage', async () => {
    const { useCronAliases } = await import('../useCronAliases')
    const { aliases, setAlias, clearAlias, getAlias } = useCronAliases()

    setAlias('job-a', 'My Cron Job')
    expect(getAlias('job-a')).toBe('My Cron Job')

    clearAlias('job-a')

    expect(getAlias('job-a')).toBeNull()
    expect(aliases.value.has('job-a')).toBe(false)
    expect(localStorage.getItem('oc_cron_alias:job-a')).toBeNull()
  })

  it('displayName returns alias when set', async () => {
    const { useCronAliases } = await import('../useCronAliases')
    const { setAlias, displayName } = useCronAliases()

    setAlias('job-a', 'My Alias')

    expect(displayName('job-a')).toBe('My Alias')
  })

  it('displayName returns fallbackName when no alias set', async () => {
    const { useCronAliases } = await import('../useCronAliases')
    const { displayName } = useCronAliases()

    expect(displayName('job-a', 'FallbackName')).toBe('FallbackName')
  })

  it('displayName returns jobId when neither alias nor fallback', async () => {
    const { useCronAliases } = await import('../useCronAliases')
    const { displayName } = useCronAliases()

    expect(displayName('job-a')).toBe('job-a')
  })

  it('setAlias with empty string removes alias (treated as clear)', async () => {
    const { useCronAliases } = await import('../useCronAliases')
    const { setAlias, getAlias, aliases } = useCronAliases()

    setAlias('job-a', 'My Cron Job')
    setAlias('job-a', '')

    expect(getAlias('job-a')).toBeNull()
    expect(aliases.value.has('job-a')).toBe(false)
  })
})
