import type { Capture } from './quickCapture'

export type DateRange = 'all' | 'today' | 'yesterday' | 'last7d' | 'last30d' | 'custom'

export interface DateRangeState {
  range: DateRange
  customFrom?: string // 'YYYY-MM-DD'
  customTo?: string // 'YYYY-MM-DD'
}

export const RANGE_LABELS: Record<DateRange, string> = {
  all: '全部',
  today: '今天',
  yesterday: '昨天',
  last7d: '最近 7 天',
  last30d: '最近 30 天',
  custom: '自訂',
}

function startOfDay(d: Date): number {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x.getTime()
}

/**
 * Parse a 'YYYY-MM-DD' string as local midnight.
 * Returns null if the string is missing, malformed, or produces an invalid date.
 */
function parseLocalDay(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(d.getTime()) ? null : d
}

export function inDateRange(capture: Capture, state: DateRangeState, now: Date = new Date()): boolean {
  const ts = capture.createdAt
  const r = state.range
  if (r === 'all') return true
  const todayStart = startOfDay(now)
  const dayMs = 24 * 60 * 60 * 1000
  switch (r) {
    case 'today':
      return ts >= todayStart && ts < todayStart + dayMs
    case 'yesterday':
      return ts >= todayStart - dayMs && ts < todayStart
    case 'last7d':
      return ts >= now.getTime() - 7 * dayMs
    case 'last30d':
      return ts >= now.getTime() - 30 * dayMs
    case 'custom': {
      const fromDate = state.customFrom ? parseLocalDay(state.customFrom) : null
      const toDate = state.customTo ? parseLocalDay(state.customTo) : null
      // Either date missing -> no filter applied
      if (!fromDate || !toDate) return true
      let fromTs = startOfDay(fromDate)
      let toTs = startOfDay(toDate) + dayMs - 1 // end of day (last ms)
      // Auto-swap if from > to
      if (fromTs > toTs) {
        const tmp = fromTs
        fromTs = toTs - dayMs + 1
        toTs = tmp + dayMs - 1
      }
      return ts >= fromTs && ts <= toTs
    }
    default:
      return true
  }
}

export function filterByDateRange(
  captures: ReadonlyArray<Capture>,
  state: DateRangeState,
  now: Date = new Date(),
): Capture[] {
  if (state.range === 'all') return [...captures]
  return captures.filter((c) => inDateRange(c, state, now))
}
