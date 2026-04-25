import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isCompleted, markCompleted, reset } from '../onboardingState'

const KEY = 'oc_onboarding_completed'

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

describe('onboardingState', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeLocalStorageStub())
  })

  it('isCompleted returns false when key is absent', () => {
    expect(isCompleted()).toBe(false)
  })

  it('markCompleted sets the key to "1"', () => {
    markCompleted()
    expect(localStorage.getItem(KEY)).toBe('1')
  })

  it('isCompleted returns true after markCompleted', () => {
    markCompleted()
    expect(isCompleted()).toBe(true)
  })

  it('reset removes the key', () => {
    markCompleted()
    reset()
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('isCompleted returns false after reset', () => {
    markCompleted()
    reset()
    expect(isCompleted()).toBe(false)
  })

  it('markCompleted is idempotent — calling twice keeps flag set', () => {
    markCompleted()
    markCompleted()
    expect(isCompleted()).toBe(true)
  })

  it('reset is a no-op when key was never set', () => {
    expect(() => reset()).not.toThrow()
    expect(isCompleted()).toBe(false)
  })
})
