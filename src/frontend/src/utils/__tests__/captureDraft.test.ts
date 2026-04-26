import { describe, it, expect, beforeEach, vi } from 'vitest'
import { loadDraft, saveDraft, clearDraft } from '../captureDraft'

const KEY = 'oc_quick_capture_draft'

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

describe('captureDraft', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeLocalStorageStub())
  })

  it('loadDraft returns empty string when nothing is stored', () => {
    expect(loadDraft()).toBe('')
  })

  it('saveDraft + loadDraft round-trip preserves the text', () => {
    saveDraft('hello world')
    expect(loadDraft()).toBe('hello world')
  })

  it('saveDraft with empty string removes the key', () => {
    saveDraft('some text')
    expect(localStorage.getItem(KEY)).toBe('some text')

    saveDraft('')
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('clearDraft removes the key', () => {
    saveDraft('draft to clear')
    expect(localStorage.getItem(KEY)).toBe('draft to clear')

    clearDraft()
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('loadDraft returns empty string after clearDraft', () => {
    saveDraft('some draft')
    clearDraft()
    expect(loadDraft()).toBe('')
  })

  it('loadDraft returns empty string when localStorage throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('storage unavailable')
      },
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0,
    })
    expect(loadDraft()).toBe('')
  })

  it('saveDraft is silent when localStorage throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota exceeded')
      },
      removeItem: () => {
        throw new Error('storage unavailable')
      },
      clear: () => {},
      key: () => null,
      length: 0,
    })
    // Should not throw
    expect(() => saveDraft('text')).not.toThrow()
    expect(() => saveDraft('')).not.toThrow()
  })

  it('clearDraft is silent when localStorage throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {
        throw new Error('storage unavailable')
      },
      clear: () => {},
      key: () => null,
      length: 0,
    })
    expect(() => clearDraft()).not.toThrow()
  })
})
