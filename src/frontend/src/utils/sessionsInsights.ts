/**
 * sessionsInsights.ts — analytical insights computed from session data.
 *
 * Provides:
 *  - totalSessions / bookmarkedCount / bookmarkPct: bookmark usage ratio
 *  - hourHistogram: 24-bucket histogram of session creation hours (createdAt)
 *  - dayHistogram: 7-bucket histogram of session creation weekdays (Sun=0)
 */

export interface SessionLike {
  id: string
  createdAt?: number | string | null
}

export interface SessionsInsights {
  totalSessions: number
  bookmarkedCount: number
  bookmarkPct: number
  hourHistogram: number[] // 24 buckets, index = hour of day (local time)
  dayHistogram: number[] // 7 buckets, index = day of week (0=Sun, 6=Sat)
}

function parseTs(v: number | string | null | undefined): number | null {
  if (v == null) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const t = Date.parse(v)
  return Number.isFinite(t) ? t : null
}

export function computeSessionsInsights<T extends SessionLike>(
  sessions: ReadonlyArray<T>,
  bookmarkedIds: ReadonlyArray<string>,
): SessionsInsights {
  const total = sessions.length
  const bookSet = new Set(bookmarkedIds)
  const bookmarkedCount = sessions.filter((s) => bookSet.has(s.id)).length
  const bookmarkPct = total > 0 ? Math.round((bookmarkedCount / total) * 100) : 0

  const hour = new Array<number>(24).fill(0)
  const day = new Array<number>(7).fill(0)

  for (const s of sessions) {
    const ts = parseTs(s.createdAt)
    if (ts === null) continue
    const d = new Date(ts)
    const h = d.getHours()
    const w = d.getDay()
    if (h >= 0 && h <= 23) hour[h] += 1
    if (w >= 0 && w <= 6) day[w] += 1
  }

  return {
    totalSessions: total,
    bookmarkedCount,
    bookmarkPct,
    hourHistogram: hour,
    dayHistogram: day,
  }
}
