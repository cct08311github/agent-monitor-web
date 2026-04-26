import { describe, it, expect, beforeEach, vi } from 'vitest'

// ---------------------------------------------------------------------------
// localStorage stub (happy-dom does not expose .clear())
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
// Mock soundEffect module before importing the composable
// ---------------------------------------------------------------------------

vi.mock('@/utils/soundEffect', () => ({
  playBeep: vi.fn(),
  _resetSoundEffectCache: vi.fn(),
  BEEP_SPECS: {
    success: { frequencies: [880], durationMs: 100, volume: 0.08 },
    info:    { frequencies: [660], durationMs: 100, volume: 0.08 },
    warning: { frequencies: [550], durationMs: 150, volume: 0.10 },
    error:   { frequencies: [440, 220], durationMs: 120, volume: 0.10 },
  },
}))

// Mock useQuietHours so we can control isQuietNow
const mockIsQuietNow = vi.fn(() => false)
vi.mock('@/composables/useQuietHours', () => ({
  isQuietNow: () => mockIsQuietNow(),
  useQuietHours: vi.fn(),
  _resetQuietHoursState: vi.fn(),
}))

import { useSoundEffect, _resetSoundEffectState } from '../useSoundEffect'
import { playBeep } from '@/utils/soundEffect'

describe('useSoundEffect', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeLocalStorageStub())
    mockIsQuietNow.mockReturnValue(false)
    vi.mocked(playBeep).mockClear()
    // Reset module-level enabled ref to match cleared localStorage (disabled)
    _resetSoundEffectState()
  })

  it('is disabled by default (no localStorage entry)', () => {
    const { isEnabled } = useSoundEffect()
    expect(isEnabled.value).toBe(false)
  })

  it('play() is a no-op when disabled', () => {
    const { play } = useSoundEffect()
    play('success')
    expect(playBeep).not.toHaveBeenCalled()
  })

  it('play() calls playBeep when enabled and not in quiet hours', () => {
    const { setEnabled, play } = useSoundEffect()
    setEnabled(true)
    play('success')
    expect(playBeep).toHaveBeenCalledWith('success')
  })

  it('play() is a no-op when isQuietNow returns true', () => {
    const { setEnabled, play } = useSoundEffect()
    setEnabled(true)
    mockIsQuietNow.mockReturnValue(true)
    play('error')
    expect(playBeep).not.toHaveBeenCalled()
  })

  it('toggle() flips enabled from false to true', () => {
    const { isEnabled, toggle } = useSoundEffect()
    expect(isEnabled.value).toBe(false)
    toggle()
    expect(isEnabled.value).toBe(true)
  })

  it('toggle() flips enabled from true to false', () => {
    const { isEnabled, setEnabled, toggle } = useSoundEffect()
    setEnabled(true)
    expect(isEnabled.value).toBe(true)
    toggle()
    expect(isEnabled.value).toBe(false)
  })

  it('toggle() persists state to localStorage', () => {
    const { toggle } = useSoundEffect()
    toggle() // false → true
    expect(localStorage.getItem('oc_sound_enabled')).toBe('1')
    toggle() // true → false
    expect(localStorage.getItem('oc_sound_enabled')).toBe('0')
  })

  it('setEnabled(true) persists "1" to localStorage', () => {
    const { setEnabled } = useSoundEffect()
    setEnabled(true)
    expect(localStorage.getItem('oc_sound_enabled')).toBe('1')
  })

  it('play() passes the correct variant to playBeep', () => {
    const { setEnabled, play } = useSoundEffect()
    setEnabled(true)
    play('warning')
    expect(playBeep).toHaveBeenCalledWith('warning')
  })

  it('play() with multiple variants calls playBeep with each', () => {
    const { setEnabled, play } = useSoundEffect()
    setEnabled(true)
    play('success')
    play('error')
    play('info')
    expect(playBeep).toHaveBeenCalledTimes(3)
    expect(vi.mocked(playBeep).mock.calls[0][0]).toBe('success')
    expect(vi.mocked(playBeep).mock.calls[1][0]).toBe('error')
    expect(vi.mocked(playBeep).mock.calls[2][0]).toBe('info')
  })
})
