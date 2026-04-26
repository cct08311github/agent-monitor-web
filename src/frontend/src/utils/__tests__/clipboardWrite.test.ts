import { describe, it, expect, beforeEach, vi } from 'vitest'
import { isClipboardWriteSupported, writeClipboardText } from '../clipboardWrite'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stubClipboardWriteText(impl: (text: string) => Promise<void>) {
  vi.stubGlobal('navigator', {
    clipboard: { writeText: impl },
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
// isClipboardWriteSupported
// ---------------------------------------------------------------------------

describe('isClipboardWriteSupported', () => {
  it('returns true when navigator.clipboard.writeText is a function', () => {
    stubClipboardWriteText(() => Promise.resolve())
    expect(isClipboardWriteSupported()).toBe(true)
  })

  it('returns false when navigator.clipboard is absent', () => {
    removeClipboard()
    expect(isClipboardWriteSupported()).toBe(false)
  })

  it('returns false when navigator is undefined', () => {
    const original = globalThis.navigator
    // @ts-expect-error — intentionally removing navigator for test
    delete globalThis.navigator
    expect(isClipboardWriteSupported()).toBe(false)
    vi.stubGlobal('navigator', original)
  })

  it('returns false when clipboard.writeText is not a function', () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: 'not-a-function' } })
    expect(isClipboardWriteSupported()).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// writeClipboardText
// ---------------------------------------------------------------------------

describe('writeClipboardText', () => {
  it('resolves true when the API succeeds', async () => {
    const mockWrite = vi.fn().mockResolvedValue(undefined)
    stubClipboardWriteText(mockWrite)
    const result = await writeClipboardText('hello world')
    expect(result).toBe(true)
    expect(mockWrite).toHaveBeenCalledWith('hello world')
  })

  it('returns false when navigator.clipboard.writeText rejects (permission denied)', async () => {
    stubClipboardWriteText(() =>
      Promise.reject(new DOMException('Permission denied', 'NotAllowedError')),
    )
    const result = await writeClipboardText('some text')
    expect(result).toBe(false)
  })

  it('returns false when navigator.clipboard is undefined', async () => {
    removeClipboard()
    const result = await writeClipboardText('some text')
    expect(result).toBe(false)
  })

  it('passes the exact text string to clipboard.writeText', async () => {
    const mockWrite = vi.fn().mockResolvedValue(undefined)
    stubClipboardWriteText(mockWrite)
    const text = '[2026-04-26 15:30 · LogsTab]\nTODO: fix 5xx\n#observability'
    await writeClipboardText(text)
    expect(mockWrite).toHaveBeenCalledWith(text)
  })
})
