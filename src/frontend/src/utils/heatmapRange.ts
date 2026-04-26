// ---------------------------------------------------------------------------
// heatmapRange.ts — user-selectable range for ActivityHeatmap (7w / 12w / 24w)
// Persisted to localStorage; safe-fallback to '12' on any read error.
// ---------------------------------------------------------------------------

export type HeatmapRange = '7' | '12' | '24'

const KEY = 'oc_heatmap_range'
const VALID: ReadonlySet<HeatmapRange> = new Set(['7', '12', '24'])

export function isValidRange(s: unknown): s is HeatmapRange {
  return typeof s === 'string' && VALID.has(s as HeatmapRange)
}

export function loadRange(): HeatmapRange {
  try {
    const raw = localStorage.getItem(KEY)
    return isValidRange(raw) ? (raw as HeatmapRange) : '12'
  } catch {
    return '12'
  }
}

export function saveRange(r: HeatmapRange): void {
  try {
    localStorage.setItem(KEY, r)
  } catch {
    /* silent */
  }
}

export function weeksToInt(r: HeatmapRange): number {
  return r === '7' ? 7 : r === '24' ? 24 : 12
}

export function cellSizeFor(r: HeatmapRange): number {
  return r === '7' ? 14 : r === '24' ? 9 : 12
}
