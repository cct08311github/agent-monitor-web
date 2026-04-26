import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  BEEP_SPECS,
  playBeep,
  _resetSoundEffectCache,
  type BeepVariant,
} from '../soundEffect'

// ---------------------------------------------------------------------------
// Helpers to create a mock AudioContext
// ---------------------------------------------------------------------------

function makeOscillatorMock() {
  return {
    type: '' as OscillatorType,
    frequency: { value: 0 },
    connect: vi.fn().mockReturnThis(),
    start: vi.fn(),
    stop: vi.fn(),
  }
}

function makeGainMock() {
  return {
    gain: {
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn().mockReturnThis(),
  }
}

function makeAudioContextMock() {
  const oscillators: ReturnType<typeof makeOscillatorMock>[] = []
  const gains: ReturnType<typeof makeGainMock>[] = []

  const ctx = {
    currentTime: 0,
    destination: {},
    createOscillator: vi.fn(() => {
      const osc = makeOscillatorMock()
      oscillators.push(osc)
      return osc
    }),
    createGain: vi.fn(() => {
      const gain = makeGainMock()
      gains.push(gain)
      return gain
    }),
    _oscillators: oscillators,
    _gains: gains,
  }
  return ctx
}

describe('BEEP_SPECS', () => {
  it('has all 4 variants', () => {
    const variants: BeepVariant[] = ['success', 'info', 'warning', 'error']
    for (const v of variants) {
      expect(BEEP_SPECS[v]).toBeDefined()
    }
  })

  it('each variant has at least one frequency', () => {
    for (const spec of Object.values(BEEP_SPECS)) {
      expect(spec.frequencies.length).toBeGreaterThan(0)
    }
  })

  it('error variant has exactly 2 frequencies (two-tone)', () => {
    expect(BEEP_SPECS.error.frequencies).toHaveLength(2)
  })

  it('success/info/warning variants have exactly 1 frequency', () => {
    expect(BEEP_SPECS.success.frequencies).toHaveLength(1)
    expect(BEEP_SPECS.info.frequencies).toHaveLength(1)
    expect(BEEP_SPECS.warning.frequencies).toHaveLength(1)
  })

  it('all volumes are between 0 and 1', () => {
    for (const spec of Object.values(BEEP_SPECS)) {
      expect(spec.volume).toBeGreaterThan(0)
      expect(spec.volume).toBeLessThanOrEqual(1)
    }
  })
})

describe('playBeep', () => {
  beforeEach(() => {
    _resetSoundEffectCache()
    vi.restoreAllMocks()
  })

  it('calls createOscillator once for success (single-tone)', () => {
    const ctx = makeAudioContextMock()
    playBeep('success', ctx as unknown as AudioContext)
    expect(ctx.createOscillator).toHaveBeenCalledTimes(1)
  })

  it('calls createOscillator twice for error (two-tone)', () => {
    const ctx = makeAudioContextMock()
    playBeep('error', ctx as unknown as AudioContext)
    expect(ctx.createOscillator).toHaveBeenCalledTimes(2)
  })

  it('configures oscillator type as "sine"', () => {
    const ctx = makeAudioContextMock()
    playBeep('info', ctx as unknown as AudioContext)
    expect(ctx._oscillators[0].type).toBe('sine')
  })

  it('calls osc.start() for each oscillator', () => {
    const ctx = makeAudioContextMock()
    playBeep('success', ctx as unknown as AudioContext)
    expect(ctx._oscillators[0].start).toHaveBeenCalledTimes(1)
  })

  it('calls osc.stop() for each oscillator', () => {
    const ctx = makeAudioContextMock()
    playBeep('success', ctx as unknown as AudioContext)
    expect(ctx._oscillators[0].stop).toHaveBeenCalledTimes(1)
  })

  it('calls osc.start() and osc.stop() for each of the 2 error oscillators', () => {
    const ctx = makeAudioContextMock()
    playBeep('error', ctx as unknown as AudioContext)
    for (const osc of ctx._oscillators) {
      expect(osc.start).toHaveBeenCalledTimes(1)
      expect(osc.stop).toHaveBeenCalledTimes(1)
    }
  })

  it('applies gain envelope (setValueAtTime + ramps)', () => {
    const ctx = makeAudioContextMock()
    playBeep('warning', ctx as unknown as AudioContext)
    const gain = ctx._gains[0]
    expect(gain.gain.setValueAtTime).toHaveBeenCalled()
    expect(gain.gain.linearRampToValueAtTime).toHaveBeenCalled()
    expect(gain.gain.exponentialRampToValueAtTime).toHaveBeenCalled()
  })

  it('is a no-op when window.AudioContext is undefined', () => {
    // Remove AudioContext from the global environment
    vi.stubGlobal('AudioContext', undefined)
    vi.stubGlobal('webkitAudioContext', undefined)
    // Should not throw
    expect(() => playBeep('success')).not.toThrow()
    vi.unstubAllGlobals()
  })

  it('sets correct frequency on the oscillator', () => {
    const ctx = makeAudioContextMock()
    playBeep('success', ctx as unknown as AudioContext)
    expect(ctx._oscillators[0].frequency.value).toBe(BEEP_SPECS.success.frequencies[0])
  })
})
