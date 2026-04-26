// ---------------------------------------------------------------------------
// soundEffect — Web Audio API synthesized beeps
//
// Pure oscillator + gain-envelope synthesis. No audio files required.
// Four variants map to distinct frequency/duration combinations.
//
// AudioContext is lazy-created on first call so the browser autoplay policy
// is satisfied (the context is created after user interaction or on a server
// data event, both acceptable per browser policy).
// ---------------------------------------------------------------------------

export type BeepVariant = 'success' | 'info' | 'warning' | 'error'

export interface BeepSpec {
  /** One or more frequencies played 50ms apart for multi-tone beeps. */
  frequencies: number[]
  /** Total duration of each tone in milliseconds. */
  durationMs: number
  /** Peak gain level (0–1). Keep low to avoid startling users. */
  volume: number
}

export const BEEP_SPECS: Readonly<Record<BeepVariant, BeepSpec>> = {
  success: { frequencies: [880],      durationMs: 100, volume: 0.08 },
  info:    { frequencies: [660],      durationMs: 100, volume: 0.08 },
  warning: { frequencies: [550],      durationMs: 150, volume: 0.10 },
  error:   { frequencies: [440, 220], durationMs: 120, volume: 0.10 },
}

let cachedCtx: AudioContext | null = null

function getContext(): AudioContext | null {
  if (cachedCtx) return cachedCtx
  if (typeof window === 'undefined') return null
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  try {
    cachedCtx = new Ctor()
    return cachedCtx
  } catch {
    return null
  }
}

/**
 * Plays a synthesized beep for the given variant.
 *
 * @param variant - The type of beep to play.
 * @param contextOverride - Optional AudioContext for testing.
 */
export function playBeep(variant: BeepVariant, contextOverride?: AudioContext): void {
  const spec = BEEP_SPECS[variant]
  const ctx = contextOverride ?? getContext()
  if (!ctx) return

  const startAt = ctx.currentTime

  spec.frequencies.forEach((freq, i) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'sine'
    osc.frequency.value = freq

    const t0 = startAt + i * 0.05
    const t1 = t0 + spec.durationMs / 1000

    // Smooth attack + exponential decay to avoid click artifacts
    gain.gain.setValueAtTime(0, t0)
    gain.gain.linearRampToValueAtTime(spec.volume, t0 + 0.005)
    gain.gain.exponentialRampToValueAtTime(0.0001, t1)

    osc.connect(gain).connect(ctx.destination)
    osc.start(t0)
    osc.stop(t1 + 0.02)
  })
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** @internal — resets the cached AudioContext singleton. For tests only. */
export function _resetSoundEffectCache(): void {
  cachedCtx = null
}
