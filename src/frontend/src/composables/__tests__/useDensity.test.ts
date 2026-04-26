import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// useDensity unit tests
//
// Environment: happy-dom (vitest config). We stub localStorage per-test
// with a Map-backed shim to isolate the singleton state.
//
// Each test calls vi.resetModules() to get a fresh composable singleton
// so module-level `density` ref is reset.
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

describe('useDensity', () => {
  let originalLocalStorage: Storage

  beforeEach(() => {
    originalLocalStorage = window.localStorage
    vi.resetModules()
    // Reset document attribute between tests
    document.documentElement.removeAttribute('data-density')
  })

  afterEach(() => {
    Object.defineProperty(window, 'localStorage', {
      writable: true,
      configurable: true,
      value: originalLocalStorage,
    })
    document.documentElement.removeAttribute('data-density')
  })

  // ── Default state ──────────────────────────────────────────────────────────

  it('defaults to "comfortable" when localStorage has no saved value', async () => {
    Object.defineProperty(window, 'localStorage', {
      writable: true,
      configurable: true,
      value: makeLocalStorageStub({}),
    })

    const { useDensity } = await import('../useDensity')
    const { density } = useDensity()
    expect(density.value).toBe('comfortable')
  })

  // ── Load persisted value ───────────────────────────────────────────────────

  it('loads "compact" from localStorage when stored value is "compact"', async () => {
    Object.defineProperty(window, 'localStorage', {
      writable: true,
      configurable: true,
      value: makeLocalStorageStub({ oc_density: 'compact' }),
    })

    const { useDensity } = await import('../useDensity')
    const { density } = useDensity()
    expect(density.value).toBe('compact')
  })

  it('falls back to "comfortable" when stored value is invalid', async () => {
    Object.defineProperty(window, 'localStorage', {
      writable: true,
      configurable: true,
      value: makeLocalStorageStub({ oc_density: 'ultra-dense' }),
    })

    const { useDensity } = await import('../useDensity')
    const { density } = useDensity()
    expect(density.value).toBe('comfortable')
  })

  // ── setDensity ─────────────────────────────────────────────────────────────

  it('setDensity("compact") updates the ref and sets data-density attribute', async () => {
    Object.defineProperty(window, 'localStorage', {
      writable: true,
      configurable: true,
      value: makeLocalStorageStub({}),
    })

    const { useDensity } = await import('../useDensity')
    const { density, setDensity } = useDensity()
    setDensity('compact')
    expect(density.value).toBe('compact')
    expect(document.documentElement.getAttribute('data-density')).toBe('compact')
  })

  it('setDensity("comfortable") updates the ref and removes data-density attribute', async () => {
    Object.defineProperty(window, 'localStorage', {
      writable: true,
      configurable: true,
      value: makeLocalStorageStub({ oc_density: 'compact' }),
    })

    const { useDensity } = await import('../useDensity')
    const { density, setDensity } = useDensity()
    setDensity('comfortable')
    expect(density.value).toBe('comfortable')
    expect(document.documentElement.hasAttribute('data-density')).toBe(false)
  })

  it('setDensity persists value to localStorage', async () => {
    const stub = makeLocalStorageStub({})
    Object.defineProperty(window, 'localStorage', {
      writable: true,
      configurable: true,
      value: stub,
    })

    const { useDensity } = await import('../useDensity')
    const { setDensity } = useDensity()
    setDensity('compact')
    expect(stub.getItem('oc_density')).toBe('compact')
  })

  // ── toggleDensity ─────────────────────────────────────────────────────────

  it('toggleDensity flips comfortable → compact', async () => {
    Object.defineProperty(window, 'localStorage', {
      writable: true,
      configurable: true,
      value: makeLocalStorageStub({}),
    })

    const { useDensity } = await import('../useDensity')
    const { density, toggleDensity } = useDensity()
    expect(density.value).toBe('comfortable')
    toggleDensity()
    expect(density.value).toBe('compact')
  })

  it('toggleDensity flips compact → comfortable when pre-stored as "compact"', async () => {
    Object.defineProperty(window, 'localStorage', {
      writable: true,
      configurable: true,
      value: makeLocalStorageStub({ oc_density: 'compact' }),
    })

    const { useDensity } = await import('../useDensity')
    const { density, toggleDensity } = useDensity()
    expect(density.value).toBe('compact')
    toggleDensity()
    expect(density.value).toBe('comfortable')
  })

  it('toggleDensity sets data-density="compact" on first toggle from comfortable', async () => {
    Object.defineProperty(window, 'localStorage', {
      writable: true,
      configurable: true,
      value: makeLocalStorageStub({}),
    })

    const { useDensity } = await import('../useDensity')
    const { toggleDensity } = useDensity()
    toggleDensity()
    expect(document.documentElement.getAttribute('data-density')).toBe('compact')
  })

  it('toggleDensity removes data-density attribute on second toggle back to comfortable', async () => {
    Object.defineProperty(window, 'localStorage', {
      writable: true,
      configurable: true,
      value: makeLocalStorageStub({}),
    })

    const { useDensity } = await import('../useDensity')
    const { toggleDensity } = useDensity()
    toggleDensity() // comfortable → compact
    toggleDensity() // compact → comfortable
    expect(document.documentElement.hasAttribute('data-density')).toBe(false)
  })

  // ── isCompact ─────────────────────────────────────────────────────────────

  it('isCompact returns false when density is comfortable', async () => {
    Object.defineProperty(window, 'localStorage', {
      writable: true,
      configurable: true,
      value: makeLocalStorageStub({}),
    })

    const { useDensity } = await import('../useDensity')
    const { isCompact } = useDensity()
    expect(isCompact()).toBe(false)
  })

  it('isCompact returns true when density is compact', async () => {
    Object.defineProperty(window, 'localStorage', {
      writable: true,
      configurable: true,
      value: makeLocalStorageStub({ oc_density: 'compact' }),
    })

    const { useDensity } = await import('../useDensity')
    const { isCompact } = useDensity()
    expect(isCompact()).toBe(true)
  })

  // ── bootstrapDensity ──────────────────────────────────────────────────────

  it('bootstrapDensity applies stored compact density to DOM on call', async () => {
    Object.defineProperty(window, 'localStorage', {
      writable: true,
      configurable: true,
      value: makeLocalStorageStub({ oc_density: 'compact' }),
    })

    const { bootstrapDensity } = await import('../useDensity')
    bootstrapDensity()
    expect(document.documentElement.getAttribute('data-density')).toBe('compact')
  })

  it('bootstrapDensity does not set attribute when density is comfortable', async () => {
    Object.defineProperty(window, 'localStorage', {
      writable: true,
      configurable: true,
      value: makeLocalStorageStub({}),
    })

    const { bootstrapDensity } = await import('../useDensity')
    bootstrapDensity()
    expect(document.documentElement.hasAttribute('data-density')).toBe(false)
  })

  // ── Shared singleton ──────────────────────────────────────────────────────

  it('multiple calls to useDensity share the same density ref', async () => {
    Object.defineProperty(window, 'localStorage', {
      writable: true,
      configurable: true,
      value: makeLocalStorageStub({}),
    })

    const { useDensity } = await import('../useDensity')
    const instance1 = useDensity()
    const instance2 = useDensity()

    expect(instance1.density).toBe(instance2.density)

    instance1.toggleDensity()
    expect(instance2.density.value).toBe('compact')
  })
})
