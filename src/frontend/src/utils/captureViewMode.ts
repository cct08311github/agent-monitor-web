/**
 * captureViewMode.ts
 *
 * Persists the user's preferred view mode for QuickCaptureList
 * (flat list or timeline / day-grouped) in localStorage.
 */

export type ViewMode = 'flat' | 'timeline'

const KEY = 'oc_capture_view_mode'
const VALID: ReadonlySet<ViewMode> = new Set(['flat', 'timeline'])

export function isValidMode(s: unknown): s is ViewMode {
  return typeof s === 'string' && VALID.has(s as ViewMode)
}

export function loadViewMode(): ViewMode {
  try {
    const raw = localStorage.getItem(KEY)
    return isValidMode(raw) ? raw : 'flat'
  } catch {
    return 'flat'
  }
}

export function saveViewMode(m: ViewMode): void {
  try {
    localStorage.setItem(KEY, m)
  } catch {
    /* silent — localStorage may be unavailable in some contexts */
  }
}
