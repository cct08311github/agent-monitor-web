import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// ---------------------------------------------------------------------------
// useColorPalette unit tests
//
// Each test imports the composable fresh via vi.resetModules() so the
// module-scoped singleton is not shared between tests.
// ---------------------------------------------------------------------------

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
  } as Storage
}

describe('useColorPalette', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeLocalStorageStub())
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    document.documentElement.removeAttribute('data-palette')
  })

  // ── 1. Default state ─────────────────────────────────────────────────────

  it('starts with "default" palette when nothing is stored', async () => {
    const { useColorPalette } = await import('../useColorPalette')
    const { palette } = useColorPalette()
    expect(palette.value).toBe('default')
  })

  it('starts with "cb-safe" when it is persisted in localStorage', async () => {
    vi.stubGlobal('localStorage', makeLocalStorageStub({ oc_color_palette: 'cb-safe' }))
    const { useColorPalette } = await import('../useColorPalette')
    const { palette } = useColorPalette()
    expect(palette.value).toBe('cb-safe')
  })

  // ── 2. setPalette ────────────────────────────────────────────────────────

  it('setPalette updates the reactive ref and persists to localStorage', async () => {
    const lsStub = makeLocalStorageStub()
    vi.stubGlobal('localStorage', lsStub)
    const { useColorPalette } = await import('../useColorPalette')
    const { palette, setPalette } = useColorPalette()

    setPalette('cb-safe')
    expect(palette.value).toBe('cb-safe')
    expect(lsStub.getItem('oc_color_palette')).toBe('cb-safe')
  })

  it('setPalette("cb-safe") sets data-palette attribute on documentElement', async () => {
    const { useColorPalette } = await import('../useColorPalette')
    const { setPalette } = useColorPalette()

    setPalette('cb-safe')
    expect(document.documentElement.getAttribute('data-palette')).toBe('cb-safe')
  })

  it('setPalette("default") removes data-palette attribute', async () => {
    document.documentElement.setAttribute('data-palette', 'cb-safe')
    const { useColorPalette } = await import('../useColorPalette')
    const { setPalette } = useColorPalette()

    setPalette('default')
    expect(document.documentElement.hasAttribute('data-palette')).toBe(false)
  })

  // ── 3. togglePalette ─────────────────────────────────────────────────────

  it('togglePalette flips from "default" to "cb-safe"', async () => {
    const { useColorPalette } = await import('../useColorPalette')
    const { palette, togglePalette } = useColorPalette()

    expect(palette.value).toBe('default')
    togglePalette()
    expect(palette.value).toBe('cb-safe')
  })

  it('togglePalette flips from "cb-safe" back to "default"', async () => {
    vi.stubGlobal('localStorage', makeLocalStorageStub({ oc_color_palette: 'cb-safe' }))
    const { useColorPalette } = await import('../useColorPalette')
    const { palette, togglePalette } = useColorPalette()

    expect(palette.value).toBe('cb-safe')
    togglePalette()
    expect(palette.value).toBe('default')
  })

  // ── 4. isCbSafe ──────────────────────────────────────────────────────────

  it('isCbSafe() returns false for "default"', async () => {
    const { useColorPalette } = await import('../useColorPalette')
    const { isCbSafe } = useColorPalette()
    expect(isCbSafe()).toBe(false)
  })

  it('isCbSafe() returns true after switching to "cb-safe"', async () => {
    const { useColorPalette } = await import('../useColorPalette')
    const { setPalette, isCbSafe } = useColorPalette()
    setPalette('cb-safe')
    expect(isCbSafe()).toBe(true)
  })

  // ── 5. bootstrapPalette ───────────────────────────────────────────────────

  it('bootstrapPalette applies the stored cb-safe palette on call', async () => {
    vi.stubGlobal('localStorage', makeLocalStorageStub({ oc_color_palette: 'cb-safe' }))
    const { bootstrapPalette } = await import('../useColorPalette')
    bootstrapPalette()
    expect(document.documentElement.getAttribute('data-palette')).toBe('cb-safe')
  })

  it('bootstrapPalette removes data-palette when stored value is "default"', async () => {
    document.documentElement.setAttribute('data-palette', 'cb-safe')
    vi.stubGlobal('localStorage', makeLocalStorageStub({ oc_color_palette: 'default' }))
    const { bootstrapPalette } = await import('../useColorPalette')
    bootstrapPalette()
    expect(document.documentElement.hasAttribute('data-palette')).toBe(false)
  })
})
