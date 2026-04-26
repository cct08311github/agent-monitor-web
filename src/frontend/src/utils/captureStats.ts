/**
 * captureStats.ts — aggregate statistics for Quick Capture.
 *
 * Computes summary counts (total, archived, pinned, unique tags, top tag)
 * from the full captures array plus the archived / pinned side-channel stores.
 */

import type { Capture } from './quickCapture'
import { tagCounts } from './quickCaptureTags'

export interface CaptureStats {
  total: number
  archived: number
  pinned: number
  tagCount: number
  topTag: { tag: string; count: number } | null
}

/**
 * Compute aggregate stats across all captures.
 *
 * @param captures    - Full list of all captures (active + archived).
 * @param archivedIds - Set of IDs that are currently archived.
 * @param pinnedIds   - Ordered array of IDs that are currently pinned.
 */
export function computeCaptureStats(
  captures: ReadonlyArray<Capture>,
  archivedIds: ReadonlySet<string>,
  pinnedIds: ReadonlyArray<string>,
): CaptureStats {
  const counts = tagCounts(captures)
  const pinSet = new Set(pinnedIds)
  return {
    total: captures.length,
    archived: captures.filter((c) => archivedIds.has(c.id)).length,
    pinned: captures.filter((c) => pinSet.has(c.id)).length,
    tagCount: counts.length,
    topTag: counts.length > 0 ? { tag: counts[0].tag, count: counts[0].count } : null,
  }
}
