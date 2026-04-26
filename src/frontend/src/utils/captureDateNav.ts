/**
 * captureDateNav.ts
 *
 * Utilities for the timeline jump-to-date feature in QuickCaptureList.
 * Provides helpers to derive which dates have captures and what the
 * min/max date range is, so the UI can constrain the date picker and
 * decide whether to scroll or show a toast.
 *
 * All date math uses LOCAL timezone to match user expectations.
 */

import type { Capture } from './quickCapture'
import { dateKey } from './activityHeatmap'

/**
 * Returns a Set of YYYY-MM-DD strings (local timezone) for every capture.
 */
export function captureDateKeys(captures: ReadonlyArray<Capture>): Set<string> {
  return new Set(captures.map((c) => dateKey(new Date(c.createdAt))))
}

/**
 * Returns true if any capture falls on the given YYYY-MM-DD date string.
 */
export function hasCaptureOnDate(captures: ReadonlyArray<Capture>, target: string): boolean {
  return captureDateKeys(captures).has(target)
}

/**
 * Returns the min and max YYYY-MM-DD date strings across all captures.
 * Returns { min: null, max: null } when the array is empty.
 */
export function captureDateRange(captures: ReadonlyArray<Capture>): {
  min: string | null
  max: string | null
} {
  if (!captures.length) return { min: null, max: null }

  let minTs = captures[0].createdAt
  let maxTs = captures[0].createdAt

  for (const c of captures) {
    if (c.createdAt < minTs) minTs = c.createdAt
    if (c.createdAt > maxTs) maxTs = c.createdAt
  }

  return {
    min: dateKey(new Date(minTs)),
    max: dateKey(new Date(maxTs)),
  }
}
