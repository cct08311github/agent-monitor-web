/**
 * captureInsights.ts — analytical insights computed from a captures array.
 *
 * Provides:
 *  - topTags: top-3 tags by occurrence count
 *  - topContexts: top-3 contexts by capture count
 *  - hourHistogram: 24-bucket capture frequency by hour-of-day
 *  - dayHistogram: 7-bucket capture frequency by day-of-week (0=Sun…6=Sat)
 *  - avgPerActiveDay: average captures per day that had at least one capture
 */

import type { Capture } from './quickCapture'
import { extractTags } from './quickCaptureTags'

export interface RankedItem {
  label: string
  count: number
  pct: number // 0..100, rounded to int
}

export interface CaptureInsights {
  topTags: RankedItem[]
  topContexts: RankedItem[]
  hourHistogram: number[]
  dayHistogram: number[]
  avgPerActiveDay: number
}

function topN(counts: Map<string, number>, n: number, total: number): RankedItem[] {
  const items = Array.from(counts, ([label, count]) => ({
    label,
    count,
    pct: total > 0 ? Math.round((count / total) * 100) : 0,
  }))
  items.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
  return items.slice(0, n)
}

export function computeInsights(captures: ReadonlyArray<Capture>): CaptureInsights {
  // Tag counts — each tag in a capture counts once per capture
  const tagCounts = new Map<string, number>()
  for (const c of captures) {
    for (const t of extractTags(c.body)) {
      tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1)
    }
  }

  // Context counts
  const ctxCounts = new Map<string, number>()
  for (const c of captures) {
    if (c.context) ctxCounts.set(c.context, (ctxCounts.get(c.context) ?? 0) + 1)
  }

  // Hour & day histograms
  const hour = new Array<number>(24).fill(0)
  const day = new Array<number>(7).fill(0)
  const dayKeys = new Set<string>()

  for (const c of captures) {
    const d = new Date(c.createdAt)
    hour[d.getHours()] += 1
    day[d.getDay()] += 1
    dayKeys.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`)
  }

  const totalCaptures = captures.length
  // Tag percentage denominator: total tag instances across all captures
  const tagDenominator = Array.from(tagCounts.values()).reduce((a, b) => a + b, 0)
  const avgPerActiveDay = dayKeys.size > 0 ? totalCaptures / dayKeys.size : 0

  return {
    topTags: topN(tagCounts, 3, tagDenominator),
    topContexts: topN(ctxCounts, 3, totalCaptures),
    hourHistogram: hour,
    dayHistogram: day,
    avgPerActiveDay,
  }
}
