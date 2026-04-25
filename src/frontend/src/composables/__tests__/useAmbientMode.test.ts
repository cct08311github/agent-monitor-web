import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { nextTick } from 'vue'

// ---------------------------------------------------------------------------
// useAmbientMode unit tests
//
// Environment: happy-dom. happy-dom's localStorage may not expose all Storage
// methods, so we stub it with a Map-backed shim via vi.stubGlobal.
//
// Module-scope singleton state — vi.resetModules() before each test gives a
// fresh composable. vi.useFakeTimers() drives setInterval deterministically.
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

describe('useAmbientMode', () => {
  let lsStub: Storage
  const addEventSpy = vi.spyOn(document, 'addEventListener')
  const removeEventSpy = vi.spyOn(document, 'removeEventListener')

  beforeEach(() => {
    vi.useFakeTimers()
    lsStub = makeLocalStorageStub()
    vi.stubGlobal('localStorage', lsStub)
    vi.resetModules()
    addEventSpy.mockClear()
    removeEventSpy.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  // ── 1. Loads enabled=false by default ────────────────────────────────────

  it('initialises enabled=false when localStorage has no key', async () => {
    const { useAmbientMode } = await import('../useAmbientMode')
    const onCycle = vi.fn()
    const ambient = useAmbientMode({ getAgentIds: () => ['a1', 'a2'], onCycle })

    expect(ambient.enabled.value).toBe(false)
  })

  // ── 2. Loads enabled=true from localStorage ───────────────────────────────

  it('initialises enabled=true when localStorage has oc_ambient_mode=1', async () => {
    lsStub.setItem('oc_ambient_mode', '1')
    const { useAmbientMode } = await import('../useAmbientMode')
    const onCycle = vi.fn()
    const ambient = useAmbientMode({ getAgentIds: () => ['a1'], onCycle })

    expect(ambient.enabled.value).toBe(true)
  })

  // ── 3. toggle() persists enabled state ───────────────────────────────────

  it('toggle() sets enabled=true and persists to localStorage', async () => {
    const { useAmbientMode } = await import('../useAmbientMode')
    const onCycle = vi.fn()
    const ambient = useAmbientMode({ getAgentIds: () => ['a1'], onCycle })

    ambient.toggle()
    await nextTick()

    expect(ambient.enabled.value).toBe(true)
    expect(lsStub.getItem('oc_ambient_mode')).toBe('1')
  })

  it('toggle() twice restores enabled=false and persists', async () => {
    const { useAmbientMode } = await import('../useAmbientMode')
    const onCycle = vi.fn()
    const ambient = useAmbientMode({ getAgentIds: () => ['a1'], onCycle })

    ambient.toggle()
    await nextTick()
    ambient.toggle()
    await nextTick()

    expect(ambient.enabled.value).toBe(false)
    expect(lsStub.getItem('oc_ambient_mode')).toBe('0')
  })

  // ── 4. tick() advances currentIndex and calls onCycle ────────────────────

  it('tick advances currentIndex after interval and calls onCycle', async () => {
    const { useAmbientMode } = await import('../useAmbientMode')
    const onCycle = vi.fn()
    const ambient = useAmbientMode({ getAgentIds: () => ['a1', 'a2', 'a3'], onCycle })

    ambient.toggle() // enable → start()
    await nextTick()

    vi.advanceTimersByTime(8_000)
    expect(onCycle).toHaveBeenCalledWith('a2')
    expect(ambient.currentIndex.value).toBe(1)
  })

  it('tick wraps around when reaching end of list', async () => {
    const { useAmbientMode } = await import('../useAmbientMode')
    const onCycle = vi.fn()
    const ids = ['a1', 'a2']
    const ambient = useAmbientMode({ getAgentIds: () => ids, onCycle })

    ambient.toggle()
    await nextTick()

    vi.advanceTimersByTime(8_000) // index → 1
    vi.advanceTimersByTime(8_000) // index → 0 (wrap)
    expect(ambient.currentIndex.value).toBe(0)
  })

  // ── 5. tick on empty list is a no-op ─────────────────────────────────────

  it('tick on empty agent list does not call onCycle', async () => {
    const { useAmbientMode } = await import('../useAmbientMode')
    const onCycle = vi.fn()
    const ambient = useAmbientMode({ getAgentIds: () => [], onCycle })

    ambient.toggle()
    await nextTick()

    vi.advanceTimersByTime(8_000)
    expect(onCycle).not.toHaveBeenCalled()
  })

  // ── 6. mousemove bumpInteraction pauses tick for 30s ─────────────────────

  it('bumpInteraction pauses tick for 30 seconds', async () => {
    const { useAmbientMode } = await import('../useAmbientMode')
    const onCycle = vi.fn()
    const ambient = useAmbientMode({ getAgentIds: () => ['a1', 'a2'], onCycle })

    ambient.toggle()
    await nextTick()

    // Trigger interaction — sets pausedUntil = now + 30s
    ambient.bumpInteraction()

    // Advance less than 30s — tick should be suppressed
    vi.advanceTimersByTime(8_000)
    expect(onCycle).not.toHaveBeenCalled()
  })

  // ── 7. tick during pause is no-op ────────────────────────────────────────

  it('tick is skipped while pausedUntil is in the future', async () => {
    const { useAmbientMode } = await import('../useAmbientMode')
    const onCycle = vi.fn()
    const ambient = useAmbientMode({ getAgentIds: () => ['a1', 'a2'], onCycle })

    ambient.toggle()
    await nextTick()

    ambient.bumpInteraction()

    // Still inside 30s window — two intervals suppressed
    vi.advanceTimersByTime(16_000)
    expect(onCycle).not.toHaveBeenCalled()

    // After 30s the pause expires — next interval fires
    vi.advanceTimersByTime(14_001)
    vi.advanceTimersByTime(8_000)
    expect(onCycle).toHaveBeenCalledTimes(1)
  })

  // ── 8. setIntervalMs restarts cycle ──────────────────────────────────────

  it('setIntervalMs changes the cycle interval', async () => {
    const { useAmbientMode } = await import('../useAmbientMode')
    const onCycle = vi.fn()
    const ambient = useAmbientMode({ getAgentIds: () => ['a1', 'a2', 'a3'], onCycle })

    ambient.toggle()
    await nextTick()

    // Change to shorter interval while running
    ambient.setIntervalMs(4_000)
    await nextTick()

    vi.advanceTimersByTime(4_000)
    expect(onCycle).toHaveBeenCalledTimes(1)
  })

  // ── 9. cleanup on unmount ─────────────────────────────────────────────────

  it('stop() clears the interval and removes event listeners', async () => {
    const { useAmbientMode } = await import('../useAmbientMode')
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')
    const onCycle = vi.fn()
    const ambient = useAmbientMode({ getAgentIds: () => ['a1'], onCycle })

    ambient.toggle() // start
    await nextTick()

    // Toggle off → stop()
    ambient.toggle()
    await nextTick()

    expect(clearIntervalSpy).toHaveBeenCalled()
    expect(removeEventSpy).toHaveBeenCalledWith('mousemove', expect.any(Function))
    expect(removeEventSpy).toHaveBeenCalledWith('keydown', expect.any(Function))
  })

  // ── 10. start() registers document listeners ─────────────────────────────

  it('start() registers mousemove and keydown listeners on document', async () => {
    const { useAmbientMode } = await import('../useAmbientMode')
    const onCycle = vi.fn()
    const ambient = useAmbientMode({ getAgentIds: () => ['a1'], onCycle })

    ambient.toggle()
    await nextTick()

    expect(addEventSpy).toHaveBeenCalledWith('mousemove', expect.any(Function))
    expect(addEventSpy).toHaveBeenCalledWith('keydown', expect.any(Function))
  })
})
