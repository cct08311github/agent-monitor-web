import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import {
  useWhatsNew,
  installWhatsNewAutoOpen,
  teardownWhatsNewAutoOpen,
} from '../useWhatsNew'
import { LATEST_VERSION } from '@/data/whatsNew'

function makeLocalStorageStub(seed: Record<string, string> = {}): Storage {
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

/** Reset module-scoped isOpen and cancel any pending timer. */
function resetWhatsNewState(): void {
  const wn = useWhatsNew()
  wn.isOpen.value = false
  teardownWhatsNewAutoOpen()
}

const LS_KEY = 'oc_whats_new_seen_version'

describe('useWhatsNew', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('localStorage', makeLocalStorageStub())
    resetWhatsNewState()
  })

  afterEach(() => {
    teardownWhatsNewAutoOpen()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  // ── open / close ────────────────────────────────────────────────────────────

  it('isOpen starts as false', () => {
    const { isOpen } = useWhatsNew()
    expect(isOpen.value).toBe(false)
  })

  it('open() sets isOpen to true', () => {
    const { isOpen, open } = useWhatsNew()
    open()
    expect(isOpen.value).toBe(true)
  })

  it('close() sets isOpen to false', () => {
    const { isOpen, open, close } = useWhatsNew()
    open()
    close()
    expect(isOpen.value).toBe(false)
  })

  // ── markSeen ────────────────────────────────────────────────────────────────

  it('markSeen writes LATEST_VERSION to localStorage', () => {
    const { markSeen } = useWhatsNew()
    markSeen()
    expect(localStorage.getItem(LS_KEY)).toBe(LATEST_VERSION)
  })

  it('markSeen closes the popup', () => {
    const { isOpen, open, markSeen } = useWhatsNew()
    open()
    expect(isOpen.value).toBe(true)
    markSeen()
    expect(isOpen.value).toBe(false)
  })

  // ── installWhatsNewAutoOpen ─────────────────────────────────────────────────

  it('installWhatsNewAutoOpen opens after the delay when version is newer', () => {
    const { isOpen } = useWhatsNew()
    expect(isOpen.value).toBe(false)

    installWhatsNewAutoOpen(1500)
    vi.advanceTimersByTime(1499)
    expect(isOpen.value).toBe(false)

    vi.advanceTimersByTime(1)
    expect(isOpen.value).toBe(true)
  })

  it('installWhatsNewAutoOpen does NOT open when lastSeen equals LATEST_VERSION', () => {
    vi.stubGlobal('localStorage', makeLocalStorageStub({ [LS_KEY]: LATEST_VERSION }))

    const { isOpen } = useWhatsNew()
    installWhatsNewAutoOpen(1500)
    vi.advanceTimersByTime(2000)
    expect(isOpen.value).toBe(false)
  })

  it('installWhatsNewAutoOpen does NOT open when lastSeen is newer than LATEST_VERSION', () => {
    vi.stubGlobal('localStorage', makeLocalStorageStub({ [LS_KEY]: '9999.12.31' }))

    const { isOpen } = useWhatsNew()
    installWhatsNewAutoOpen(1500)
    vi.advanceTimersByTime(2000)
    expect(isOpen.value).toBe(false)
  })

  it('installWhatsNewAutoOpen is idempotent — second call is ignored', () => {
    const { isOpen } = useWhatsNew()
    installWhatsNewAutoOpen(1500)
    installWhatsNewAutoOpen(100) // should NOT fire at 100ms
    vi.advanceTimersByTime(100)
    expect(isOpen.value).toBe(false)
    vi.advanceTimersByTime(1400)
    expect(isOpen.value).toBe(true)
  })

  it('teardownWhatsNewAutoOpen cancels the pending timer', () => {
    const { isOpen } = useWhatsNew()
    installWhatsNewAutoOpen(1500)
    teardownWhatsNewAutoOpen()
    vi.advanceTimersByTime(2000)
    expect(isOpen.value).toBe(false)
  })
})
