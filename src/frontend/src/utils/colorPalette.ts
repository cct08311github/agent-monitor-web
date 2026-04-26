// ---------------------------------------------------------------------------
// colorPalette — Okabe-Ito color-blind safe palette utility
//
// Persistence key: 'oc_color_palette'
// Two named palettes:
//   'default'  — existing design-system colors
//   'cb-safe'  — Okabe-Ito variant (vermilion / bluish-green / yellow / sky-blue)
//
// Apply by setting data-palette="cb-safe" on <html>; theme.css overrides
// the four semantic tokens under that selector.
// ---------------------------------------------------------------------------

export type PaletteName = 'default' | 'cb-safe'

const KEY = 'oc_color_palette'

const VALID: ReadonlySet<PaletteName> = new Set(['default', 'cb-safe'])

export function isValidPaletteName(s: unknown): s is PaletteName {
  return typeof s === 'string' && VALID.has(s as PaletteName)
}

export function loadPalette(): PaletteName {
  try {
    const raw = localStorage.getItem(KEY)
    return isValidPaletteName(raw) ? raw : 'default'
  } catch {
    return 'default'
  }
}

export function savePalette(p: PaletteName): void {
  try {
    localStorage.setItem(KEY, p)
  } catch {
    // silent — non-critical
  }
}

export function applyPalette(p: PaletteName): void {
  if (typeof document === 'undefined') return
  const el = document.documentElement
  if (p === 'default') {
    el.removeAttribute('data-palette')
  } else {
    el.setAttribute('data-palette', p)
  }
}
