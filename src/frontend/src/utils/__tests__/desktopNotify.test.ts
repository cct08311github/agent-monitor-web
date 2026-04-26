import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getPermission,
  requestPermission,
  isEnabled,
  setEnabled,
  showNotification,
} from '../desktopNotify'

// ---------------------------------------------------------------------------
// Mock Notification class
// ---------------------------------------------------------------------------

class MockNotification {
  static permission: 'default' | 'granted' | 'denied' = 'default'
  static async requestPermission(): Promise<'default' | 'granted' | 'denied'> {
    return MockNotification.permission
  }
  onclick: ((this: MockNotification, ev: Event) => void) | null = null
  title: string
  options: NotificationOptions
  constructor(title: string, options: NotificationOptions = {}) {
    this.title = title
    this.options = options
  }
  close(): void {
    /* no-op */
  }
}

// ---------------------------------------------------------------------------
// localStorage stub
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  MockNotification.permission = 'default'
  vi.stubGlobal('Notification', MockNotification)
  vi.stubGlobal('localStorage', makeLocalStorageStub())
})

// ---------------------------------------------------------------------------
// getPermission
// ---------------------------------------------------------------------------

describe('getPermission', () => {
  it('returns "unsupported" when Notification is undefined', () => {
    vi.stubGlobal('Notification', undefined)
    expect(getPermission()).toBe('unsupported')
  })

  it('returns "default" when permission is default', () => {
    MockNotification.permission = 'default'
    expect(getPermission()).toBe('default')
  })

  it('returns "granted" when permission is granted', () => {
    MockNotification.permission = 'granted'
    expect(getPermission()).toBe('granted')
  })

  it('returns "denied" when permission is denied', () => {
    MockNotification.permission = 'denied'
    expect(getPermission()).toBe('denied')
  })
})

// ---------------------------------------------------------------------------
// requestPermission
// ---------------------------------------------------------------------------

describe('requestPermission', () => {
  it('returns "unsupported" when Notification is undefined', async () => {
    vi.stubGlobal('Notification', undefined)
    const result = await requestPermission()
    expect(result).toBe('unsupported')
  })

  it('returns the resolved permission from Notification.requestPermission()', async () => {
    MockNotification.permission = 'granted'
    const result = await requestPermission()
    expect(result).toBe('granted')
  })

  it('returns "denied" when requestPermission resolves to denied', async () => {
    MockNotification.permission = 'denied'
    const result = await requestPermission()
    expect(result).toBe('denied')
  })

  it('returns "denied" when requestPermission throws', async () => {
    vi.stubGlobal('Notification', {
      permission: 'default',
      requestPermission: () => Promise.reject(new Error('blocked')),
    })
    const result = await requestPermission()
    expect(result).toBe('denied')
  })
})

// ---------------------------------------------------------------------------
// isEnabled / setEnabled
// ---------------------------------------------------------------------------

describe('isEnabled / setEnabled', () => {
  it('returns false by default (key absent)', () => {
    expect(isEnabled()).toBe(false)
  })

  it('setEnabled(true) stores "1" and isEnabled() returns true', () => {
    setEnabled(true)
    expect(isEnabled()).toBe(true)
    expect(localStorage.getItem('oc_desktop_notify_enabled')).toBe('1')
  })

  it('setEnabled(false) stores "0" and isEnabled() returns false', () => {
    setEnabled(true)
    setEnabled(false)
    expect(isEnabled()).toBe(false)
    expect(localStorage.getItem('oc_desktop_notify_enabled')).toBe('0')
  })

  it('round-trip: true → false → true', () => {
    setEnabled(true)
    expect(isEnabled()).toBe(true)
    setEnabled(false)
    expect(isEnabled()).toBe(false)
    setEnabled(true)
    expect(isEnabled()).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// showNotification
// ---------------------------------------------------------------------------

describe('showNotification', () => {
  it('returns null when isEnabled() is false (default)', () => {
    MockNotification.permission = 'granted'
    const result = showNotification('Agent Monitor', 'test', {
      isHidden: () => true,
      isQuiet: () => false,
    })
    expect(result).toBeNull()
  })

  it('returns null when permission is not "granted"', () => {
    setEnabled(true)
    MockNotification.permission = 'default'
    const result = showNotification('Agent Monitor', 'test', {
      isHidden: () => true,
      isQuiet: () => false,
    })
    expect(result).toBeNull()
  })

  it('returns null when isHidden() returns false (tab is visible)', () => {
    setEnabled(true)
    MockNotification.permission = 'granted'
    const result = showNotification('Agent Monitor', 'test', {
      isHidden: () => false,
      isQuiet: () => false,
    })
    expect(result).toBeNull()
  })

  it('returns null when isQuiet() returns true', () => {
    setEnabled(true)
    MockNotification.permission = 'granted'
    const result = showNotification('Agent Monitor', 'test', {
      isHidden: () => true,
      isQuiet: () => true,
    })
    expect(result).toBeNull()
  })

  it('returns a Notification instance when all guards pass', () => {
    setEnabled(true)
    MockNotification.permission = 'granted'
    const result = showNotification('Agent Monitor', 'CPU 95%', {
      isHidden: () => true,
      isQuiet: () => false,
    })
    expect(result).toBeInstanceOf(MockNotification)
  })

  it('sets notification.onclick handler', () => {
    setEnabled(true)
    MockNotification.permission = 'granted'
    const result = showNotification('Agent Monitor', 'test body', {
      isHidden: () => true,
      isQuiet: () => false,
    })
    expect(result).not.toBeNull()
    expect(typeof result?.onclick).toBe('function')
  })

  it('returns null when Notification constructor throws', () => {
    setEnabled(true)
    vi.stubGlobal('Notification', {
      permission: 'granted',
      // eslint-disable-next-line @typescript-eslint/no-extraneous-class
      requestPermission: async () => 'granted',
    })
    // Notification is not constructable — no constructor function
    const result = showNotification('Agent Monitor', 'test', {
      isHidden: () => true,
      isQuiet: () => false,
    })
    expect(result).toBeNull()
  })

  it('passes body and title to Notification constructor', () => {
    setEnabled(true)
    MockNotification.permission = 'granted'
    const result = showNotification('Alert Title', 'Alert Body', {
      isHidden: () => true,
      isQuiet: () => false,
    }) as MockNotification | null
    expect(result?.title).toBe('Alert Title')
    expect(result?.options.body).toBe('Alert Body')
  })
})
