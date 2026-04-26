/**
 * Tests for src/utils/speechRecognition.ts
 *
 * Environment: happy-dom — SpeechRecognition is not provided natively.
 * Strategy:    inject a minimal mock class via vi.stubGlobal so the module
 *              can be tested without a real browser engine.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createSpeechRecognition,
  isSpeechRecognitionSupported,
  type SpeechRecognitionWrapper,
} from '../speechRecognition'

// ── helpers ───────────────────────────────────────────────────────────────

interface MockInstance {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((e: unknown) => void) | null
  onerror: ((e: unknown) => void) | null
  onend: (() => void) | null
  start: ReturnType<typeof vi.fn>
  stop: ReturnType<typeof vi.fn>
}

function makeMockCtor(): { Ctor: new () => MockInstance; instances: MockInstance[] } {
  const instances: MockInstance[] = []

  class MockSpeechRecognition implements MockInstance {
    lang = ''
    interimResults = false
    continuous = false
    onresult: ((e: unknown) => void) | null = null
    onerror: ((e: unknown) => void) | null = null
    onend: (() => void) | null = null
    start = vi.fn()
    stop = vi.fn()

    constructor() {
      instances.push(this)
    }
  }

  return { Ctor: MockSpeechRecognition, instances }
}

// ── setup / teardown ──────────────────────────────────────────────────────

beforeEach(() => {
  vi.stubGlobal('SpeechRecognition', undefined)
  vi.stubGlobal('webkitSpeechRecognition', undefined)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ── isSpeechRecognitionSupported ──────────────────────────────────────────

describe('isSpeechRecognitionSupported', () => {
  it('returns false when both SpeechRecognition and webkitSpeechRecognition are undefined', () => {
    expect(isSpeechRecognitionSupported()).toBe(false)
  })

  it('returns true when SpeechRecognition is stubbed on window', () => {
    const { Ctor } = makeMockCtor()
    vi.stubGlobal('SpeechRecognition', Ctor)
    expect(isSpeechRecognitionSupported()).toBe(true)
  })

  it('returns true when only webkitSpeechRecognition is stubbed on window', () => {
    const { Ctor } = makeMockCtor()
    vi.stubGlobal('webkitSpeechRecognition', Ctor)
    expect(isSpeechRecognitionSupported()).toBe(true)
  })
})

// ── createSpeechRecognition ───────────────────────────────────────────────

describe('createSpeechRecognition', () => {
  it('returns null when the API is not supported', () => {
    expect(createSpeechRecognition()).toBeNull()
  })

  it('returns a wrapper with start and stop methods when supported', () => {
    const { Ctor } = makeMockCtor()
    vi.stubGlobal('SpeechRecognition', Ctor)

    const wrapper = createSpeechRecognition()
    expect(wrapper).not.toBeNull()
    expect(typeof wrapper!.start).toBe('function')
    expect(typeof wrapper!.stop).toBe('function')
  })

  it('configures the recognizer with the given lang and single-utterance settings', () => {
    const { Ctor, instances } = makeMockCtor()
    vi.stubGlobal('SpeechRecognition', Ctor)

    createSpeechRecognition('en-US')
    const rec = instances[0]
    expect(rec.lang).toBe('en-US')
    expect(rec.interimResults).toBe(false)
    expect(rec.continuous).toBe(false)
  })

  it('uses zh-TW as the default language', () => {
    const { Ctor, instances } = makeMockCtor()
    vi.stubGlobal('SpeechRecognition', Ctor)

    createSpeechRecognition()
    expect(instances[0].lang).toBe('zh-TW')
  })

  it('calls the underlying start() when wrapper.start() is called', () => {
    const { Ctor, instances } = makeMockCtor()
    vi.stubGlobal('SpeechRecognition', Ctor)

    const wrapper = createSpeechRecognition()!
    wrapper.start()
    expect(instances[0].start).toHaveBeenCalledOnce()
  })

  it('calls the underlying stop() when wrapper.stop() is called', () => {
    const { Ctor, instances } = makeMockCtor()
    vi.stubGlobal('SpeechRecognition', Ctor)

    const wrapper = createSpeechRecognition()!
    wrapper.stop()
    expect(instances[0].stop).toHaveBeenCalledOnce()
  })

  it('fires onResult with the joined transcript when onresult fires', () => {
    const { Ctor, instances } = makeMockCtor()
    vi.stubGlobal('SpeechRecognition', Ctor)

    const wrapper = createSpeechRecognition()!
    const received: string[] = []
    wrapper.onResult = (t) => received.push(t)

    // Simulate browser firing onresult
    const fakeEvent = {
      results: [[{ transcript: '  你好世界  ' }]],
    }
    instances[0].onresult!(fakeEvent)
    expect(received).toEqual(['你好世界'])
  })

  it('fires onError with error code string when onerror fires', () => {
    const { Ctor, instances } = makeMockCtor()
    vi.stubGlobal('SpeechRecognition', Ctor)

    const wrapper = createSpeechRecognition()!
    const errors: string[] = []
    wrapper.onError = (m) => errors.push(m)

    instances[0].onerror!({ error: 'no-speech' })
    expect(errors).toEqual(['no-speech'])
  })

  it('fires onEnd when onend fires', () => {
    const { Ctor, instances } = makeMockCtor()
    vi.stubGlobal('SpeechRecognition', Ctor)

    const wrapper = createSpeechRecognition()!
    let ended = false
    wrapper.onEnd = () => {
      ended = true
    }

    instances[0].onend!()
    expect(ended).toBe(true)
  })

  it('falls back to webkitSpeechRecognition when SpeechRecognition is absent', () => {
    const { Ctor, instances } = makeMockCtor()
    // Only webkit variant
    vi.stubGlobal('webkitSpeechRecognition', Ctor)

    const wrapper = createSpeechRecognition('ja-JP')
    expect(wrapper).not.toBeNull()
    expect(instances[0].lang).toBe('ja-JP')
  })

  it('exposes no-op default callbacks so the wrapper is usable before callbacks are assigned', () => {
    const { Ctor } = makeMockCtor()
    vi.stubGlobal('SpeechRecognition', Ctor)

    const wrapper: SpeechRecognitionWrapper = createSpeechRecognition()!
    // Should not throw when invoked with no assignment
    expect(() => wrapper.onResult('test')).not.toThrow()
    expect(() => wrapper.onError('err')).not.toThrow()
    expect(() => wrapper.onEnd()).not.toThrow()
  })
})
