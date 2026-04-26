// ---------------------------------------------------------------------------
// soundPrefs — localStorage persistence for sound-effect toggle
//
// Key: 'oc_sound_enabled'
// Value: '1' = enabled, '0' = disabled
// Default: disabled (no surprise beeps on first load)
// ---------------------------------------------------------------------------

const KEY = 'oc_sound_enabled'

/** Returns true only if the user has explicitly enabled sound effects. */
export function isSoundEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

/** Persists the sound-enabled state. Silently ignores storage errors. */
export function setSoundEnabled(b: boolean): void {
  try {
    localStorage.setItem(KEY, b ? '1' : '0')
  } catch {
    // Ignore QuotaExceededError or private-mode restrictions
  }
}
