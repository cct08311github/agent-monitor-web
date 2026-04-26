import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  isPromptShown,
  markShown,
  resetShown,
  shouldShowPrompt,
} from '../notifyPromptState'

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
// Mock desktopNotify.getPermission
// ---------------------------------------------------------------------------

vi.mock('../desktopNotify', () => ({
  getPermission: vi.fn(() => 'default'),
}))

import { getPermission } from '../desktopNotify'
const mockGetPermission = vi.mocked(getPermission)

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.stubGlobal('localStorage', makeLocalStorageStub())
  mockGetPermission.mockReturnValue('default')
})

// ---------------------------------------------------------------------------
// isPromptShown
// ---------------------------------------------------------------------------

describe('isPromptShown', () => {
  it('returns false by default (key absent)', () => {
    expect(isPromptShown()).toBe(false)
  })

  it('returns true after markShown() is called', () => {
    markShown()
    expect(isPromptShown()).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// markShown / isPromptShown round-trip
// ---------------------------------------------------------------------------

describe('markShown + isPromptShown round-trip', () => {
  it('sets key to "1" and isPromptShown() reports true', () => {
    markShown()
    expect(localStorage.getItem('oc_notify_prompt_shown')).toBe('1')
    expect(isPromptShown()).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// resetShown
// ---------------------------------------------------------------------------

describe('resetShown', () => {
  it('clears the stored flag so isPromptShown() returns false again', () => {
    markShown()
    expect(isPromptShown()).toBe(true)
    resetShown()
    expect(isPromptShown()).toBe(false)
    expect(localStorage.getItem('oc_notify_prompt_shown')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// shouldShowPrompt
// ---------------------------------------------------------------------------

describe('shouldShowPrompt', () => {
  it('returns true when permission=default and prompt not shown', () => {
    mockGetPermission.mockReturnValue('default')
    expect(shouldShowPrompt()).toBe(true)
  })

  it('returns false when permission=granted (even if not shown)', () => {
    mockGetPermission.mockReturnValue('granted')
    expect(shouldShowPrompt()).toBe(false)
  })

  it('returns false when permission=denied', () => {
    mockGetPermission.mockReturnValue('denied')
    expect(shouldShowPrompt()).toBe(false)
  })

  it('returns false when permission=unsupported', () => {
    mockGetPermission.mockReturnValue('unsupported')
    expect(shouldShowPrompt()).toBe(false)
  })

  it('returns false when prompt was previously shown (even if permission=default)', () => {
    mockGetPermission.mockReturnValue('default')
    markShown()
    expect(shouldShowPrompt()).toBe(false)
  })
})
