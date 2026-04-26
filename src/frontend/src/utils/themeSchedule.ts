// ---------------------------------------------------------------------------
// themeSchedule — pure helpers for time-based automatic theme switching
//
// When enabled, the schedule checks the current time each minute and applies
// 'light' or 'dark' based on configured lightAt / darkAt boundaries.
//
// Manual T-key theme overrides are respected: the composable tracks the last
// theme it applied via a boundary crossing. If the user manually changes the
// theme afterwards, the composable does nothing until the next boundary is
// crossed (at which point lastBoundaryTheme will differ from the new expected
// theme, triggering re-application).
//
// Storage key: 'oc_theme_schedule'
// Format: { enabled: boolean, lightAt: 'HH:MM', darkAt: 'HH:MM' }
// ---------------------------------------------------------------------------

import { parseHM, minutesOf } from './quietHours'

export { parseHM, minutesOf }

const KEY = 'oc_theme_schedule'

export interface ThemeScheduleConfig {
  enabled: boolean
  lightAt: string // 'HH:MM' — when light theme starts
  darkAt: string  // 'HH:MM' — when dark theme starts
}

export const DEFAULT_CONFIG: ThemeScheduleConfig = {
  enabled: false,
  lightAt: '06:00',
  darkAt: '18:00',
}

export type ScheduleTheme = 'light' | 'dark'

/**
 * Returns the expected theme for the given config and time, or null when
 * the schedule is disabled or config is invalid.
 *
 * Boundary semantics (mirrors quietHours logic):
 *   light < dark  → same-day light window (e.g. 06:00..18:00)
 *                   cur in [lightAt, darkAt) → 'light', otherwise 'dark'
 *   light > dark  → overnight light window  (e.g. 18:00..06:00 next day)
 *                   cur in [lightAt, 24:00) ∪ [00:00, darkAt) → 'light'
 *   light === dark → null (zero-length, ambiguous)
 */
export function expectedTheme(
  config: ThemeScheduleConfig,
  now: Date = new Date(),
): ScheduleTheme | null {
  if (!config.enabled) return null

  const light = minutesOf(config.lightAt)
  const dark = minutesOf(config.darkAt)

  if (Number.isNaN(light) || Number.isNaN(dark)) return null
  if (light === dark) return null

  const cur = now.getHours() * 60 + now.getMinutes()

  if (light < dark) {
    // Same-day light window: lightAt..darkAt
    return cur >= light && cur < dark ? 'light' : 'dark'
  }

  // Overnight light window: lightAt onwards until darkAt next day
  // e.g. lightAt=18:00, darkAt=06:00 → light from 18:00 to 05:59
  return cur >= light || cur < dark ? 'light' : 'dark'
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function isValidConfig(o: unknown): o is ThemeScheduleConfig {
  if (!o || typeof o !== 'object') return false
  const r = o as Record<string, unknown>
  return (
    typeof r.enabled === 'boolean' &&
    typeof r.lightAt === 'string' &&
    parseHM(r.lightAt) !== null &&
    typeof r.darkAt === 'string' &&
    parseHM(r.darkAt) !== null
  )
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

/** Loads theme schedule config from localStorage. Falls back to DEFAULT_CONFIG. */
export function loadConfig(): ThemeScheduleConfig {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULT_CONFIG }
    const parsed: unknown = JSON.parse(raw)
    return isValidConfig(parsed) ? parsed : { ...DEFAULT_CONFIG }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

/** Persists theme schedule config to localStorage. Silently ignores storage errors. */
export function saveConfig(c: ThemeScheduleConfig): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(c))
  } catch {
    // Ignore QuotaExceededError or private-mode restrictions
  }
}
