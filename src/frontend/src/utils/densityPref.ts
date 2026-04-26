// ---------------------------------------------------------------------------
// densityPref — UI density preference utility
//
// Persistence key: 'oc_density'
// Two named modes:
//   'comfortable' — default spacing (no attribute set on <html>)
//   'compact'     — reduced spacing (~20-25% tighter)
//
// Apply by setting data-density="compact" on <html>; theme.css overrides
// spacing tokens under :root[data-density="compact"].
// ---------------------------------------------------------------------------

export type DensityMode = 'comfortable' | 'compact'

const KEY = 'oc_density'

const VALID: ReadonlySet<DensityMode> = new Set(['comfortable', 'compact'])

export function isValidDensity(s: unknown): s is DensityMode {
  return typeof s === 'string' && VALID.has(s as DensityMode)
}

export function loadDensity(): DensityMode {
  try {
    const raw = localStorage.getItem(KEY)
    return isValidDensity(raw) ? (raw as DensityMode) : 'comfortable'
  } catch {
    return 'comfortable'
  }
}

export function saveDensity(d: DensityMode): void {
  try {
    localStorage.setItem(KEY, d)
  } catch {
    // silent — non-critical
  }
}

export function applyDensity(d: DensityMode): void {
  if (typeof document === 'undefined') return
  const el = document.documentElement
  if (d === 'comfortable') {
    el.removeAttribute('data-density')
  } else {
    el.setAttribute('data-density', d)
  }
}
