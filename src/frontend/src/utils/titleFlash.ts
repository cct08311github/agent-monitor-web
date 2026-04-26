// ---------------------------------------------------------------------------
// titleFlash — brief tab title flicker to attract peripheral-vision attention
//
// When a new alert arrives while the tab is hidden, this util alternates
// document.title between the original value and FLASH_TEXT so the tab bar
// catches the user's eye.
//
// Behaviour:
//   - Default ON (localStorage key "oc_title_flash_enabled", value "1")
//   - Respects prefers-reduced-motion: skip the interval entirely
//   - Does NOT overlap: a second call while flashing returns the stop fn early
//   - Auto-stops after `durationMs` (default 10 s)
//   - Tab becoming visible (visibilitychange) stops the flash immediately
//
// Usage:
//   startFlash()          — begin flashing (no-op when already flashing)
//   isFlashEnabled()      — read localStorage preference
//   setFlashEnabled(bool) — persist preference
//   isCurrentlyFlashing() — inspect current state
//   _resetFlashState()    — for unit tests only
// ---------------------------------------------------------------------------

import { isSnoozedNow as isNotifySnoozed } from '@/utils/notifySnooze'

const KEY = 'oc_title_flash_enabled'
const FLASH_TEXT = '🔴 新 ALERT'

// ---------------------------------------------------------------------------
// Preference helpers
// ---------------------------------------------------------------------------

export function isFlashEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) !== '0'
  } catch {
    return true // default ON when localStorage is unavailable
  }
}

export function setFlashEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(KEY, enabled ? '1' : '0')
  } catch {
    /* silent — storage may be blocked in some browsers */
  }
}

// ---------------------------------------------------------------------------
// Flash state (module-scoped)
// ---------------------------------------------------------------------------

let flashIntervalId: ReturnType<typeof setInterval> | null = null
let flashTimeoutId: ReturnType<typeof setTimeout> | null = null
let originalTitle = ''
let flashing = false

// ---------------------------------------------------------------------------
// Stop helper — restores title and clears timers
// ---------------------------------------------------------------------------

function stopFlash(): void {
  if (flashIntervalId !== null) {
    clearInterval(flashIntervalId)
    flashIntervalId = null
  }
  if (flashTimeoutId !== null) {
    clearTimeout(flashTimeoutId)
    flashTimeoutId = null
  }
  if (flashing && originalTitle !== '') {
    document.title = originalTitle
  }
  flashing = false
}

// ---------------------------------------------------------------------------
// Visibility listener — installed once when first flash is requested
// ---------------------------------------------------------------------------

let visibilityListenerInstalled = false

function ensureVisibilityListener(): void {
  if (visibilityListenerInstalled) return
  if (typeof document === 'undefined') return
  visibilityListenerInstalled = true
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && flashing) {
      stopFlash()
    }
  })
}

// ---------------------------------------------------------------------------
// Main API
// ---------------------------------------------------------------------------

/**
 * Starts alternating `document.title` between the current value and
 * `FLASH_TEXT`.
 *
 * @param durationMs  Total flash duration in ms (default 10 000).
 * @param intervalMs  Interval between title swaps in ms (default 1 200).
 * @returns A function that immediately stops the flash when called.
 */
export function startFlash(
  durationMs: number = 10_000,
  intervalMs: number = 1_200,
): () => void {
  if (typeof document === 'undefined') return () => {}

  // Guard: ad-hoc snooze (#584)
  if (isNotifySnoozed()) return () => {}

  // Respect prefers-reduced-motion
  if (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  ) {
    return () => {}
  }

  // Do NOT overlap: return the existing stop fn if already flashing
  if (flashing) return stopFlash

  ensureVisibilityListener()

  originalTitle = document.title
  flashing = true
  let toggle = false

  flashIntervalId = setInterval(() => {
    toggle = !toggle
    document.title = toggle ? FLASH_TEXT : originalTitle
  }, intervalMs)

  flashTimeoutId = setTimeout(() => {
    stopFlash()
  }, durationMs)

  return stopFlash
}

/** Whether the title is currently flashing. */
export function isCurrentlyFlashing(): boolean {
  return flashing
}

/**
 * Reset all flash state.
 * Exported for unit tests only — do NOT call from production code.
 */
export function _resetFlashState(): void {
  stopFlash()
  visibilityListenerInstalled = false
}
