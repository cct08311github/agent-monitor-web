/**
 * captureHeatmap.ts
 *
 * Pure utility functions for building a 30-day linear heatmap of quick-capture
 * frequency.  Reuses dateKey, bucketByDay, and intensityBucket from
 * activityHeatmap.ts so colour tokens and bucketing logic stay consistent.
 */

import type { Capture } from './quickCapture'
import { dateKey, bucketByDay } from './activityHeatmap'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface CaptureGridCell {
  date: Date
  /** YYYY-MM-DD (local timezone) */
  key: string
  /**
   * true for all cells in the requested range.  Reserved for future use
   * (e.g. marking future-date padding cells) while keeping the API stable.
   */
  inRange: boolean
}

// ---------------------------------------------------------------------------
// bucketCapturesByDay
// ---------------------------------------------------------------------------

/**
 * Aggregate an array of Capture records into a day→count map.
 * Delegates to the shared bucketByDay helper which handles all timestamp
 * forms (number, string, Date).
 */
export function bucketCapturesByDay(
  captures: ReadonlyArray<Capture>,
): Map<string, number> {
  return bucketByDay(captures.map((c) => ({ createdAt: c.createdAt })))
}

// ---------------------------------------------------------------------------
// buildCaptureGrid
// ---------------------------------------------------------------------------

/**
 * Build an ordered array of `days` cells ending with `today`.
 *
 * Index 0 is the oldest day; index `days - 1` is today.
 * All cells are marked `inRange: true`.
 */
export function buildCaptureGrid(today: Date, days: number): CaptureGridCell[] {
  const cells: CaptureGridCell[] = []

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - i)

    cells.push({
      date: new Date(d),
      key: dateKey(d),
      inRange: true,
    })
  }

  return cells
}
