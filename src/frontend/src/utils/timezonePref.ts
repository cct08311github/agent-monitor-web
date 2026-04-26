export type TimezoneMode = 'local' | 'utc'

const KEY = 'oc_timezone_mode'
const VALID: ReadonlySet<TimezoneMode> = new Set(['local', 'utc'])

export function isValidMode(s: unknown): s is TimezoneMode {
  return typeof s === 'string' && VALID.has(s as TimezoneMode)
}

export function loadMode(): TimezoneMode {
  try {
    const raw = localStorage.getItem(KEY)
    return isValidMode(raw) ? (raw as TimezoneMode) : 'local'
  } catch {
    return 'local'
  }
}

export function saveMode(m: TimezoneMode): void {
  try {
    localStorage.setItem(KEY, m)
  } catch {
    /* silent — e.g. private browsing quota exceeded */
  }
}
