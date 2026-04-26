/**
 * captureTimeline.ts
 *
 * Groups a list of Capture items into date-keyed buckets with human-readable
 * day labels for the timeline view in QuickCaptureList.
 *
 * All date math uses LOCAL timezone to match user expectations.
 */

import type { Capture } from './quickCapture'
import { dateKey } from './activityHeatmap'

export interface TimelineGroup {
  dateKey: string
  label: string
  captures: Capture[]
}

const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'] as const

function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

/**
 * Returns a human-readable label for a given date relative to `now`.
 *
 * - Same day  → '今天'
 * - 1 day ago → '昨天'
 * - 2-6 days ago → 'N 天前'
 * - 7+ days ago or future → 'YYYY-MM-DD (週X)'
 */
export function dayLabel(date: Date, now: Date = new Date()): string {
  const dStart = startOfDay(date).getTime()
  const nStart = startOfDay(now).getTime()
  const diffDays = Math.round((nStart - dStart) / (24 * 60 * 60 * 1000))

  if (diffDays === 0) return '今天'
  if (diffDays === 1) return '昨天'
  if (diffDays > 1 && diffDays < 7) return `${diffDays} 天前`

  // 7+ days ago or future: format as YYYY-MM-DD (週X)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const w = WEEKDAY_LABELS[date.getDay()]
  return `${y}-${m}-${d} (週${w})`
}

/**
 * Groups captures by calendar day (local timezone), sorted newest-first.
 * Within each group, the original order of captures is preserved.
 */
export function groupByDay(
  captures: ReadonlyArray<Capture>,
  now: Date = new Date(),
): TimelineGroup[] {
  if (captures.length === 0) return []

  const map = new Map<string, Capture[]>()
  for (const c of captures) {
    const d = new Date(c.createdAt)
    const k = dateKey(d)
    const arr = map.get(k) ?? []
    arr.push(c)
    map.set(k, arr)
  }

  // Sort group keys descending (newest date first)
  const sortedKeys = Array.from(map.keys()).sort((a, b) => b.localeCompare(a))

  return sortedKeys.map((k) => {
    const groupCaptures = map.get(k)!
    // Use the first capture's timestamp to generate the label
    return {
      dateKey: k,
      label: dayLabel(new Date(groupCaptures[0].createdAt), now),
      captures: groupCaptures,
    }
  })
}
