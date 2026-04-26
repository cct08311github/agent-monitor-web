// ---------------------------------------------------------------------------
// quietHours — pure helpers for the "Quiet Hours" notification suppression
//
// During a configured time window, the title badge counter is suppressed so
// background tab alerts don't flash numbers at inconvenient hours.
//
// Storage key: 'oc_quiet_hours'
// Format: { enabled: boolean, start: 'HH:MM', end: 'HH:MM' }
// ---------------------------------------------------------------------------

const KEY = 'oc_quiet_hours'

export interface QuietHoursConfig {
  enabled: boolean
  start: string // 'HH:MM'
  end: string   // 'HH:MM'
}

export const DEFAULT_CONFIG: QuietHoursConfig = {
  enabled: false,
  start: '22:00',
  end: '07:00',
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

/**
 * Parses a 'HH:MM' string into hours and minutes.
 * Returns null if the string is not a valid 24-hour time.
 */
export function parseHM(s: string): { h: number; m: number } | null {
  const match = /^([0-1]?\d|2[0-3]):([0-5]\d)$/.exec(s)
  if (!match) return null
  return { h: Number(match[1]), m: Number(match[2]) }
}

/**
 * Converts a 'HH:MM' string to total minutes since midnight.
 * Returns NaN if the string is invalid.
 */
export function minutesOf(s: string): number {
  const p = parseHM(s)
  return p ? p.h * 60 + p.m : NaN
}

// ---------------------------------------------------------------------------
// Core logic
// ---------------------------------------------------------------------------

/**
 * Returns true if "now" falls within the configured quiet window.
 *
 * Three cases:
 *   start === end  -> always false (zero-length window)
 *   start < end    -> same-day window  (e.g. 09:00-17:00)
 *   start > end    -> overnight window (e.g. 22:00-07:00)
 */
export function isInQuietHours(
  config: QuietHoursConfig,
  now: Date = new Date(),
): boolean {
  if (!config.enabled) return false

  const start = minutesOf(config.start)
  const end = minutesOf(config.end)

  if (Number.isNaN(start) || Number.isNaN(end)) return false
  if (start === end) return false

  const cur = now.getHours() * 60 + now.getMinutes()

  if (start < end) {
    // Same-day window: 09:00-17:00
    return cur >= start && cur < end
  }
  // Overnight window: 22:00-07:00 (wraps midnight)
  return cur >= start || cur < end
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function isValidConfig(o: unknown): o is QuietHoursConfig {
  if (!o || typeof o !== 'object') return false
  const r = o as Record<string, unknown>
  return (
    typeof r.enabled === 'boolean' &&
    typeof r.start === 'string' &&
    parseHM(r.start) !== null &&
    typeof r.end === 'string' &&
    parseHM(r.end) !== null
  )
}

/** Loads quiet-hours config from localStorage. Falls back to DEFAULT_CONFIG. */
export function loadConfig(): QuietHoursConfig {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULT_CONFIG }
    const parsed: unknown = JSON.parse(raw)
    return isValidConfig(parsed) ? parsed : { ...DEFAULT_CONFIG }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

/** Persists quiet-hours config to localStorage. Silently ignores storage errors. */
export function saveConfig(c: QuietHoursConfig): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(c))
  } catch {
    // Ignore QuotaExceededError or private-mode restrictions
  }
}
