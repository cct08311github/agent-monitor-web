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

describe('useAgentAliases', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeLocalStorageStub())
    // Reset module-scoped state by re-importing
    vi.resetModules()
  })

  it('setAlias updates aliases reactive map', async () => {
    const { useAgentAliases } = await import('../useAgentAliases')
    const { aliases, setAlias, getAlias } = useAgentAliases()

    expect(getAlias('agent-a')).toBeNull()

    setAlias('agent-a', 'My Agent')

    expect(getAlias('agent-a')).toBe('My Agent')
    expect(aliases.value.get('agent-a')).toBe('My Agent')
  })

  it('clearAlias removes from reactive map and localStorage', async () => {
    const { useAgentAliases } = await import('../useAgentAliases')
    const { aliases, setAlias, clearAlias, getAlias } = useAgentAliases()

    setAlias('agent-a', 'My Agent')
    expect(getAlias('agent-a')).toBe('My Agent')

    clearAlias('agent-a')

    expect(getAlias('agent-a')).toBeNull()
    expect(aliases.value.has('agent-a')).toBe(false)
    expect(localStorage.getItem('oc_agent_alias:agent-a')).toBeNull()
  })

  it('displayName returns alias when set', async () => {
    const { useAgentAliases } = await import('../useAgentAliases')
    const { setAlias, displayName } = useAgentAliases()

    setAlias('agent-a', 'My Alias')

    expect(displayName('agent-a')).toBe('My Alias')
  })

  it('displayName returns fallbackName when no alias set', async () => {
    const { useAgentAliases } = await import('../useAgentAliases')
    const { displayName } = useAgentAliases()

    expect(displayName('agent-a', 'FallbackName')).toBe('FallbackName')
  })

  it('displayName returns agentId when neither alias nor fallback', async () => {
    const { useAgentAliases } = await import('../useAgentAliases')
    const { displayName } = useAgentAliases()

    expect(displayName('agent-a')).toBe('agent-a')
  })

  it('setAlias with empty string removes alias (treated as clear)', async () => {
    const { useAgentAliases } = await import('../useAgentAliases')
    const { setAlias, getAlias, aliases } = useAgentAliases()

    setAlias('agent-a', 'My Agent')
    setAlias('agent-a', '')

    expect(getAlias('agent-a')).toBeNull()
    expect(aliases.value.has('agent-a')).toBe(false)
  })
})
