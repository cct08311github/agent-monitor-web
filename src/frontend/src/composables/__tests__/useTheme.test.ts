import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { nextTick } from 'vue'

// ---------------------------------------------------------------------------
// useTheme unit tests
//
// Environment: happy-dom (vitest config). happy-dom's localStorage does not
// expose .clear(), so we stub localStorage per-test with a Map-backed shim.
//
// Each test calls vi.resetModules() to get a fresh composable singleton.
// ---------------------------------------------------------------------------

/** Minimal Map-backed localStorage stub compatible with happy-dom tests. */
function makeLocalStorageStub(initial: Record<string, string> = {}): Storage {
  const store = new Map<string, string>(Object.entries(initial))
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v) },
    removeItem: (k: string) => { store.delete(k) },
    clear: () => { store.clear() },
    get length() { return store.size },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
  }
}

/** Stub window.matchMedia before importing the composable. */
function stubMatchMedia(prefersDark: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: query === '(prefers-color-scheme: dark)' ? prefersDark : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  })
}

describe('useTheme — ThemeMode extended to 5 values', () => {
  let lsStub: Storage

  beforeEach(() => {
    lsStub = makeLocalStorageStub()
    vi.stubGlobal('localStorage', lsStub)
    stubMatchMedia(false)
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    document.documentElement.removeAttribute('data-theme')
  })

  // ── 1. Load neon from localStorage ─────────────────────────────────────────

  it('loads neon from localStorage', async () => {
    lsStub.setItem('oc_theme', 'neon')
    const { useTheme } = await import('../useTheme')
    const { currentTheme } = useTheme()
    expect(currentTheme.value).toBe('neon')
  })

  // ── 2. Load retro from localStorage ────────────────────────────────────────

  it('loads retro from localStorage', async () => {
    lsStub.setItem('oc_theme', 'retro')
    const { useTheme } = await import('../useTheme')
    const { currentTheme } = useTheme()
    expect(currentTheme.value).toBe('retro')
  })

  // ── 3. Invalid localStorage value falls back to auto ────────────────────────

  it('falls back to auto for invalid localStorage value', async () => {
    lsStub.setItem('oc_theme', 'invalid_theme')
    const { useTheme } = await import('../useTheme')
    const { currentTheme } = useTheme()
    expect(currentTheme.value).toBe('auto')
  })

  // ── 4. setTheme sets a specific theme directly ───────────────────────────────

  it('setTheme sets neon directly without cycling', async () => {
    const { useTheme } = await import('../useTheme')
    const { currentTheme, setTheme } = useTheme()
    setTheme('neon')
    expect(currentTheme.value).toBe('neon')
  })

  it('setTheme sets retro directly', async () => {
    const { useTheme } = await import('../useTheme')
    const { currentTheme, setTheme } = useTheme()
    setTheme('retro')
    expect(currentTheme.value).toBe('retro')
  })

  // ── 5. Full 5-theme cycle ────────────────────────────────────────────────────

  it('cycles through all 5 themes: light → dark → auto → neon → retro → light', async () => {
    lsStub.setItem('oc_theme', 'light')
    const { useTheme } = await import('../useTheme')
    const { currentTheme, cycleTheme } = useTheme()

    expect(currentTheme.value).toBe('light')
    cycleTheme()
    expect(currentTheme.value).toBe('dark')
    cycleTheme()
    expect(currentTheme.value).toBe('auto')
    cycleTheme()
    expect(currentTheme.value).toBe('neon')
    cycleTheme()
    expect(currentTheme.value).toBe('retro')
    cycleTheme()
    expect(currentTheme.value).toBe('light') // wraps back
  })

  // ── 6. effectiveTheme for neon/retro is the theme itself ────────────────────

  it('effectiveTheme for neon is neon (not mapped to light/dark)', async () => {
    lsStub.setItem('oc_theme', 'neon')
    const { useTheme } = await import('../useTheme')
    const { effectiveTheme } = useTheme()
    expect(effectiveTheme.value).toBe('neon')
  })

  it('effectiveTheme for retro is retro', async () => {
    lsStub.setItem('oc_theme', 'retro')
    const { useTheme } = await import('../useTheme')
    const { effectiveTheme } = useTheme()
    expect(effectiveTheme.value).toBe('retro')
  })

  // ── 7. Neon/retro persisted to localStorage after setTheme ──────────────────

  it('persists neon to localStorage after nextTick', async () => {
    const { useTheme } = await import('../useTheme')
    const { setTheme } = useTheme()
    setTheme('neon')
    await nextTick()
    expect(lsStub.getItem('oc_theme')).toBe('neon')
  })

  it('persists retro to localStorage after nextTick', async () => {
    const { useTheme } = await import('../useTheme')
    const { setTheme } = useTheme()
    setTheme('retro')
    await nextTick()
    expect(lsStub.getItem('oc_theme')).toBe('retro')
  })
})
