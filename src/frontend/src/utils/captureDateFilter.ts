import type { Capture } from './quickCapture'

export type DateRange = 'all' | 'today' | 'yesterday' | 'last7d' | 'last30d'

export const RANGE_LABELS: Record<DateRange, string> = {
  all: '全部',
  today: '今天',
  yesterday: '昨天',
  last7d: '最近 7 天',
  last30d: '最近 30 天',
}

function startOfDay(d: Date): number {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x.getTime()
}

export function inDateRange(capture: Capture, range: DateRange, now: Date = new Date()): boolean {
  const ts = capture.createdAt
  if (range === 'all') return true
  const todayStart = startOfDay(now)
  const dayMs = 24 * 60 * 60 * 1000
  switch (range) {
    case 'today':
      return ts >= todayStart && ts < todayStart + dayMs
    case 'yesterday':
      return ts >= todayStart - dayMs && ts < todayStart
    case 'last7d':
      return ts >= now.getTime() - 7 * dayMs
    case 'last30d':
      return ts >= now.getTime() - 30 * dayMs
    default:
      return true
  }
}

export function filterByDateRange(
  captures: ReadonlyArray<Capture>,
  range: DateRange,
  now: Date = new Date(),
): Capture[] {
  if (range === 'all') return [...captures]
  return captures.filter((c) => inDateRange(c, range, now))
}
