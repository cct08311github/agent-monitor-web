/**
 * captureWeeklyTrend.ts — weekly trend computation for Quick Capture.
 *
 * Compares captures created in the current 7-day window (this week)
 * against the prior 7-day window (last week) and returns a percentage delta
 * with a directional label for display in the stats footer chip.
 */

import type { Capture } from './quickCapture'

export type TrendDirection = 'up' | 'down' | 'flat' | 'new'

export interface WeeklyTrend {
  thisWeek: number
  lastWeek: number
  deltaPercent: number
  direction: TrendDirection
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Compute the weekly trend for a list of captures.
 *
 * - "this week"  = captures created within the last 7 days  (age < 7 * DAY_MS)
 * - "last week"  = captures created 7-14 days ago           (7 * DAY_MS <= age < 14 * DAY_MS)
 * - Captures with a future `createdAt` (age < 0) are ignored.
 *
 * @returns null  when both windows are empty (nothing to show)
 * @returns trend with direction='new' when lastWeek=0 and thisWeek>0
 */
export function computeWeeklyTrend(
  captures: ReadonlyArray<Capture>,
  now: Date = new Date(),
): WeeklyTrend | null {
  const nowMs = now.getTime()
  let thisWeek = 0
  let lastWeek = 0

  for (const c of captures) {
    const age = nowMs - c.createdAt
    if (age < 0) continue
    if (age < 7 * DAY_MS) thisWeek++
    else if (age < 14 * DAY_MS) lastWeek++
  }

  if (thisWeek === 0 && lastWeek === 0) return null

  if (lastWeek === 0) {
    return { thisWeek, lastWeek, deltaPercent: 0, direction: 'new' }
  }

  const delta = ((thisWeek - lastWeek) / lastWeek) * 100
  const direction: TrendDirection = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'
  return { thisWeek, lastWeek, deltaPercent: Math.round(delta), direction }
}

/**
 * Format a WeeklyTrend as a short display label.
 *
 * Examples: "↑ NEW", "↑ 33%", "↓ 50%", "─ 0%"
 */
export function trendLabel(trend: WeeklyTrend): string {
  switch (trend.direction) {
    case 'new':
      return '↑ NEW'
    case 'up':
      return `↑ ${Math.abs(trend.deltaPercent)}%`
    case 'down':
      return `↓ ${Math.abs(trend.deltaPercent)}%`
    case 'flat':
      return '─ 0%'
  }
}
