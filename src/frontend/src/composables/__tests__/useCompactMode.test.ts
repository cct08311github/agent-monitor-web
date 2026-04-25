import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { nextTick } from 'vue'

// ---------------------------------------------------------------------------
// useCompactMode unit tests
//
// Environment: happy-dom (vitest config). We stub localStorage per-test
// with a Map-backed shim to isolate the singleton state.
//
// Each test calls vi.resetModules() to get a fresh composable singleton
// so module-level `compact` ref is reset.
// ---------------------------------------------------------------------------

/** Minimal Map-backed localStorage stub. */
function makeLocalStorageStub(initial: Record<string, string> = {}): Storage {
  const store = new Map<string, string>(Object.entries(initial))
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v)
    },
    removeItem: (k: string) => {
      store.delete(k)
    },
    clear: () => {
      store.clear()
    },
    get length() {
      return store.size
    },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
  }
}

describe('useCompactMode', () => {
  let originalLocalStorage: Storage

  beforeEach(() => {
    originalLocalStorage = window.localStorage
    vi.resetModules()
  })

  afterEach(() => {
    Object.defineProperty(window, 'localStorage', {
      writable: true,
      configurable: true,
      value: originalLocalStorage,
    })
  })

  // ── Default state ──────────────────────────────────────────────────────────

  it('defaults to false when localStorage has no saved value', async () => {
    Object.defineProperty(window, 'localStorage', {
      writable: true,
      configurable: true,
      value: makeLocalStorageStub({}),
    })

    const { useCompactMode } = await import('../useCompactMode')
    const { compact } = useCompactMode()
    expect(compact.value).toBe(false)
  })

  // ── Load persisted value ───────────────────────────────────────────────────

  it('loads true from localStorage when stored value is "1"', async () => {
    Object.defineProperty(window, 'localStorage', {
      writable: true,
      configurable: true,
      value: makeLocalStorageStub({ oc_compact_mode: '1' }),
    })

    const { useCompactMode } = await import('../useCompactMode')
    const { compact } = useCompactMode()
    expect(compact.value).toBe(true)
  })

  it('loads false from localStorage when stored value is "0"', async () => {
    Object.defineProperty(window, 'localStorage', {
      writable: true,
      configurable: true,
      value: makeLocalStorageStub({ oc_compact_mode: '0' }),
    })

    const { useCompactMode } = await import('../useCompactMode')
    const { compact } = useCompactMode()
    expect(compact.value).toBe(false)
  })

  // ── toggleCompact ─────────────────────────────────────────────────────────

  it('toggleCompact flips false → true', async () => {
    Object.defineProperty(window, 'localStorage', {
      writable: true,
      configurable: true,
      value: makeLocalStorageStub({}),
    })

    const { useCompactMode } = await import('../useCompactMode')
    const { compact, toggleCompact } = useCompactMode()
    expect(compact.value).toBe(false)
    toggleCompact()
    expect(compact.value).toBe(true)
  })

  it('toggleCompact flips true → false when pre-stored as "1"', async () => {
    Object.defineProperty(window, 'localStorage', {
      writable: true,
      configurable: true,
      value: makeLocalStorageStub({ oc_compact_mode: '1' }),
    })

    const { useCompactMode } = await import('../useCompactMode')
    const { compact, toggleCompact } = useCompactMode()
    expect(compact.value).toBe(true)
    toggleCompact()
    expect(compact.value).toBe(false)
  })

  // ── setCompact ────────────────────────────────────────────────────────────

  it('setCompact sets compact to a specific value', async () => {
    Object.defineProperty(window, 'localStorage', {
      writable: true,
      configurable: true,
      value: makeLocalStorageStub({}),
    })

    const { useCompactMode } = await import('../useCompactMode')
    const { compact, setCompact } = useCompactMode()
    expect(compact.value).toBe(false)

    setCompact(true)
    expect(compact.value).toBe(true)

    setCompact(false)
    expect(compact.value).toBe(false)
  })

  // ── Persist to localStorage ───────────────────────────────────────────────

  it('persists "1" to localStorage when compact becomes true', async () => {
    const stub = makeLocalStorageStub({})
    Object.defineProperty(window, 'localStorage', {
      writable: true,
      configurable: true,
      value: stub,
    })

    const { useCompactMode } = await import('../useCompactMode')
    const { toggleCompact } = useCompactMode()
    toggleCompact()
    await nextTick()

    expect(stub.getItem('oc_compact_mode')).toBe('1')
  })

  it('persists "0" to localStorage when compact becomes false', async () => {
    const stub = makeLocalStorageStub({ oc_compact_mode: '1' })
    Object.defineProperty(window, 'localStorage', {
      writable: true,
      configurable: true,
      value: stub,
    })

    const { useCompactMode } = await import('../useCompactMode')
    const { toggleCompact } = useCompactMode()
    toggleCompact()
    await nextTick()

    expect(stub.getItem('oc_compact_mode')).toBe('0')
  })

  // ── localStorage failure silent ───────────────────────────────────────────

  it('does not throw when localStorage.setItem throws', async () => {
    const throwingStub = makeLocalStorageStub({})
    vi.spyOn(throwingStub, 'setItem').mockImplementation(() => {
      throw new Error('storage full')
    })
    Object.defineProperty(window, 'localStorage', {
      writable: true,
      configurable: true,
      value: throwingStub,
    })

    const { useCompactMode } = await import('../useCompactMode')
    const { toggleCompact } = useCompactMode()

    expect(() => toggleCompact()).not.toThrow()
  })

  it('does not throw when localStorage.getItem throws during load', async () => {
    const throwingStub = makeLocalStorageStub({})
    vi.spyOn(throwingStub, 'getItem').mockImplementation(() => {
      throw new Error('access denied')
    })
    Object.defineProperty(window, 'localStorage', {
      writable: true,
      configurable: true,
      value: throwingStub,
    })

    // Should not throw on module load
    await expect(import('../useCompactMode')).resolves.toBeDefined()
  })

  // ── Shared singleton ──────────────────────────────────────────────────────

  it('multiple calls to useCompactMode share the same compact ref', async () => {
    Object.defineProperty(window, 'localStorage', {
      writable: true,
      configurable: true,
      value: makeLocalStorageStub({}),
    })

    const { useCompactMode } = await import('../useCompactMode')
    const instance1 = useCompactMode()
    const instance2 = useCompactMode()

    expect(instance1.compact).toBe(instance2.compact)

    instance1.toggleCompact()
    expect(instance2.compact.value).toBe(true)
  })
})
