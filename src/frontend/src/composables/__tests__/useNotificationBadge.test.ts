import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  useNotificationBadge,
  formatTitleBadge,
  installNotificationBadge,
  teardownNotificationBadge,
} from '../useNotificationBadge'
import { _resetFlashState } from '@/utils/titleFlash'

// ---------------------------------------------------------------------------
// Helpers to control document.hidden
// ---------------------------------------------------------------------------

function setDocumentHidden(hidden: boolean): void {
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: () => hidden,
  })
}

// ---------------------------------------------------------------------------
// Reset module-level state between tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.useFakeTimers()
  // Always start with tab "visible" and fresh state
  setDocumentHidden(false)
  teardownNotificationBadge()
  // Disable title flash so it does not interfere with badge title assertions
  _resetFlashState()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) =>
      k === 'oc_title_flash_enabled' ? '0' : null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
    key: () => null,
    length: 0,
  })
})

afterEach(() => {
  teardownNotificationBadge()
  _resetFlashState()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

// ---------------------------------------------------------------------------
// formatTitleBadge — pure function tests
// ---------------------------------------------------------------------------

describe('formatTitleBadge', () => {
  it('returns base title unchanged when count is 0', () => {
    expect(formatTitleBadge(0, 'Agent Monitor')).toBe('Agent Monitor')
  })

  it('prefixes with (1) for count 1', () => {
    expect(formatTitleBadge(1, 'Agent Monitor')).toBe('(1) Agent Monitor')
  })

  it('prefixes with (9) for count 9', () => {
    expect(formatTitleBadge(9, 'Agent Monitor')).toBe('(9) Agent Monitor')
  })

  it('caps at (9+) for count 10', () => {
    expect(formatTitleBadge(10, 'Agent Monitor')).toBe('(9+) Agent Monitor')
  })

  it('caps at (9+) for count 99', () => {
    expect(formatTitleBadge(99, 'Agent Monitor')).toBe('(9+) Agent Monitor')
  })

  it('handles negative count as 0 — returns base title', () => {
    expect(formatTitleBadge(-1, 'Agent Monitor')).toBe('Agent Monitor')
  })

  it('works with an arbitrary base title string', () => {
    expect(formatTitleBadge(3, 'My App')).toBe('(3) My App')
  })
})

// ---------------------------------------------------------------------------
// useNotificationBadge — increment / clear
// ---------------------------------------------------------------------------

describe('useNotificationBadge — increment / clear', () => {
  it('increment does NOT add to unreadCount when document.hidden is false', () => {
    setDocumentHidden(false)
    const badge = useNotificationBadge()
    badge.increment()
    expect(badge.unreadCount.value).toBe(0)
  })

  it('increment DOES add to unreadCount when document.hidden is true', () => {
    setDocumentHidden(true)
    const badge = useNotificationBadge()
    badge.increment()
    expect(badge.unreadCount.value).toBe(1)
  })

  it('increment with n=3 adds 3 when hidden', () => {
    setDocumentHidden(true)
    const badge = useNotificationBadge()
    badge.increment(3)
    expect(badge.unreadCount.value).toBe(3)
  })

  it('multiple increments accumulate while hidden', () => {
    setDocumentHidden(true)
    const badge = useNotificationBadge()
    badge.increment()
    badge.increment()
    badge.increment()
    expect(badge.unreadCount.value).toBe(3)
  })

  it('clear() resets unreadCount to 0', () => {
    setDocumentHidden(true)
    const badge = useNotificationBadge()
    badge.increment()
    badge.increment()
    expect(badge.unreadCount.value).toBe(2)
    badge.clear()
    expect(badge.unreadCount.value).toBe(0)
  })

  it('clear() is a no-op when count is already 0', () => {
    const badge = useNotificationBadge()
    badge.clear()
    expect(badge.unreadCount.value).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// installNotificationBadge — document.title wiring
// ---------------------------------------------------------------------------

describe('installNotificationBadge — document.title', () => {
  it('sets document.title immediately from baseTitle on install', () => {
    document.title = 'Custom Title'
    installNotificationBadge()
    expect(document.title).toBe('Custom Title')
  })

  it('updates document.title when unreadCount changes while hidden', async () => {
    document.title = 'Agent Monitor'
    installNotificationBadge()
    setDocumentHidden(true)

    const badge = useNotificationBadge()
    badge.increment()

    // Vue's watch is async — tick once
    await vi.runAllTimersAsync()

    expect(document.title).toBe('(1) Agent Monitor')
  })

  it('resets document.title to base when clear() is called', async () => {
    document.title = 'Agent Monitor'
    installNotificationBadge()
    setDocumentHidden(true)

    const badge = useNotificationBadge()
    badge.increment()
    await vi.runAllTimersAsync()
    expect(document.title).toBe('(1) Agent Monitor')

    badge.clear()
    await vi.runAllTimersAsync()
    expect(document.title).toBe('Agent Monitor')
  })

  it('setBaseTitle updates both the stored base and document.title', async () => {
    document.title = 'Old Title'
    installNotificationBadge()

    const badge = useNotificationBadge()
    badge.setBaseTitle('New Title')
    await vi.runAllTimersAsync()

    expect(document.title).toBe('New Title')
  })

  it('install is idempotent — calling twice does not double-register', async () => {
    document.title = 'Agent Monitor'
    installNotificationBadge()
    installNotificationBadge() // second call is a no-op
    setDocumentHidden(true)

    const badge = useNotificationBadge()
    badge.increment()
    await vi.runAllTimersAsync()

    // Title should read "(1) ..." not "(2) ..."
    expect(document.title).toBe('(1) Agent Monitor')
  })
})

// ---------------------------------------------------------------------------
// visibilitychange event — auto-clear
// ---------------------------------------------------------------------------

describe('visibilitychange — auto-clear on tab focus', () => {
  it('visibilitychange with hidden=false clears unreadCount', async () => {
    installNotificationBadge()
    setDocumentHidden(true)

    const badge = useNotificationBadge()
    badge.increment()
    badge.increment()
    expect(badge.unreadCount.value).toBe(2)

    // Simulate tab becoming visible
    setDocumentHidden(false)
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.runAllTimersAsync()

    expect(badge.unreadCount.value).toBe(0)
  })

  it('visibilitychange with hidden=true does NOT clear unreadCount', async () => {
    installNotificationBadge()
    setDocumentHidden(true)

    const badge = useNotificationBadge()
    badge.increment()

    // Simulate another "blur" (tab stays hidden)
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.runAllTimersAsync()

    expect(badge.unreadCount.value).toBe(1)
  })

  it('document.title reverts to base after visibility restore', async () => {
    document.title = 'Agent Monitor'
    installNotificationBadge()
    setDocumentHidden(true)

    const badge = useNotificationBadge()
    badge.increment()
    await vi.runAllTimersAsync()
    expect(document.title).toBe('(1) Agent Monitor')

    setDocumentHidden(false)
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.runAllTimersAsync()

    expect(document.title).toBe('Agent Monitor')
  })
})

// ---------------------------------------------------------------------------
// teardownNotificationBadge — cleanup
// ---------------------------------------------------------------------------

describe('teardownNotificationBadge', () => {
  it('resets unreadCount to 0 on teardown', () => {
    installNotificationBadge()
    setDocumentHidden(true)
    const badge = useNotificationBadge()
    badge.increment()
    expect(badge.unreadCount.value).toBe(1)

    teardownNotificationBadge()
    expect(badge.unreadCount.value).toBe(0)
  })

  it('allows re-installation after teardown', async () => {
    document.title = 'Agent Monitor'
    installNotificationBadge()
    teardownNotificationBadge()

    // Re-install; should work without errors
    document.title = 'Agent Monitor'
    installNotificationBadge()
    setDocumentHidden(true)

    const badge = useNotificationBadge()
    badge.increment()
    await vi.runAllTimersAsync()

    expect(document.title).toBe('(1) Agent Monitor')
  })
})
