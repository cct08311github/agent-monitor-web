import { describe, it, expect, beforeEach, vi } from 'vitest'
import { isClipboardReadSupported, readClipboardText } from '../clipboardRead'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stubClipboardReadText(impl: () => Promise<string>) {
  vi.stubGlobal('navigator', {
    clipboard: { readText: impl },
  })
}

function removeClipboard() {
  vi.stubGlobal('navigator', {})
}

beforeEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

// ---------------------------------------------------------------------------
// isClipboardReadSupported
// ---------------------------------------------------------------------------

describe('isClipboardReadSupported', () => {
  it('returns true when navigator.clipboard.readText is a function', () => {
    stubClipboardReadText(() => Promise.resolve(''))
    expect(isClipboardReadSupported()).toBe(true)
  })

  it('returns false when navigator.clipboard is absent', () => {
    removeClipboard()
    expect(isClipboardReadSupported()).toBe(false)
  })

  it('returns false when navigator is undefined', () => {
    // Temporarily hide navigator
    const original = globalThis.navigator
    // @ts-expect-error — intentionally removing navigator for test
    delete globalThis.navigator
    expect(isClipboardReadSupported()).toBe(false)
    // Restore
    vi.stubGlobal('navigator', original)
  })

  it('returns false when clipboard.readText is not a function', () => {
    vi.stubGlobal('navigator', { clipboard: { readText: 'not-a-function' } })
    expect(isClipboardReadSupported()).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// readClipboardText
// ---------------------------------------------------------------------------

describe('readClipboardText', () => {
  it('returns the clipboard string when the API resolves successfully', async () => {
    stubClipboardReadText(() => Promise.resolve('hello world'))
    const result = await readClipboardText()
    expect(result).toBe('hello world')
  })

  it('returns an empty string when clipboard is empty', async () => {
    stubClipboardReadText(() => Promise.resolve(''))
    const result = await readClipboardText()
    expect(result).toBe('')
  })

  it('returns null when navigator.clipboard.readText throws (permission denied)', async () => {
    stubClipboardReadText(() => Promise.reject(new DOMException('Permission denied', 'NotAllowedError')))
    const result = await readClipboardText()
    expect(result).toBeNull()
  })

  it('returns null when navigator.clipboard is undefined', async () => {
    removeClipboard()
    const result = await readClipboardText()
    expect(result).toBeNull()
  })
})
