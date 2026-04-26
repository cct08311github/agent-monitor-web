/**
 * captureStreak.ts — compute consecutive-day capture streak gamification stats.
 *
 * Rules:
 *  - A "day" is determined by local timezone (same as activityHeatmap.dateKey).
 *  - Multiple captures on the same day count as one day of activity.
 *  - "current" streak: number of consecutive days counting backwards from today
 *    (or yesterday if today has no captures yet — streak is still active).
 *  - "best" streak: longest consecutive run anywhere in history.
 *  - "activeToday": true only when there is at least one capture today.
 */

import type { Capture } from './quickCapture'
import { dateKey } from './activityHeatmap'

export interface StreakInfo {
  current: number
  best: number
  activeToday: boolean
}

function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function dayBefore(d: Date): Date {
  const x = new Date(d)
  x.setDate(x.getDate() - 1)
  return x
}

export function computeStreak(
  captures: ReadonlyArray<Capture>,
  now: Date = new Date(),
): StreakInfo {
  if (!captures.length) return { current: 0, best: 0, activeToday: false }

  // Build set of unique dateKeys with at least one capture
  const days = new Set<string>()
  for (const c of captures) {
    days.add(dateKey(new Date(c.createdAt)))
  }

  // Compute best streak (any consecutive window in history)
  const sortedKeys = Array.from(days).sort()
  let best = 0
  let runLen = 0
  let prevDate: Date | null = null
  for (const key of sortedKeys) {
    const d = new Date(key + 'T00:00:00')
    if (prevDate === null) {
      runLen = 1
    } else {
      const diff = Math.round(
        (startOfDay(d).getTime() - startOfDay(prevDate).getTime()) / 86400000,
      )
      if (diff === 1) runLen += 1
      else runLen = 1
    }
    if (runLen > best) best = runLen
    prevDate = d
  }

  // Compute current streak: walk backwards from today (or yesterday)
  const todayKey = dateKey(startOfDay(now))
  const yestKey = dateKey(dayBefore(startOfDay(now)))
  const activeToday = days.has(todayKey)

  // Starting day: today if active, else yesterday if active, else streak is 0
  let cursor: Date
  if (activeToday) {
    cursor = startOfDay(now)
  } else if (days.has(yestKey)) {
    cursor = dayBefore(startOfDay(now))
  } else {
    return { current: 0, best, activeToday: false }
  }

  let current = 0
  while (days.has(dateKey(cursor))) {
    current += 1
    cursor = dayBefore(cursor)
  }

  return { current, best, activeToday }
}
