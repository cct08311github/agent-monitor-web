/**
 * cronInsights.ts — analytical insights computed from cron jobs.
 *
 * Provides:
 *  - scheduleCategories: distribution of schedule patterns (minute/hourly/daily/weekly/monthly/custom)
 *  - enabledCount / disabledCount / enabledPct: enabled vs disabled ratio
 *  - topTags: top-3 tags by occurrence count across all jobs
 */

export type ScheduleCategory = 'minute' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'custom'

export interface RankedItem {
  label: string
  count: number
  pct: number // 0..100, rounded to int
}

export interface CategoryItem {
  category: ScheduleCategory
  count: number
  pct: number // 0..100, rounded to int
}

export interface CronInsights {
  scheduleCategories: CategoryItem[]
  enabledCount: number
  disabledCount: number
  enabledPct: number
  topTags: RankedItem[]
}

const SHORTCUTS: Record<string, ScheduleCategory> = {
  '@hourly': 'hourly',
  '@daily': 'daily',
  '@midnight': 'daily',
  '@weekly': 'weekly',
  '@monthly': 'monthly',
  '@yearly': 'custom',
  '@annually': 'custom',
}

/**
 * Classify a cron expression string into one of the predefined schedule categories.
 *
 * Rules (applied in order):
 * 1. Empty / blank → custom
 * 2. @-shortcut → mapped directly
 * 3. Not 5 fields → custom
 * 4. Minute field is `*` or `*\/N` → minute-granularity
 * 5. Hour field is `*` or `*\/N` → hourly
 * 6. dom=*, mon=*, dow=* → daily
 * 7. dom=*, dow specified → weekly
 * 8. dom specified, dow=* → monthly
 * 9. Fallback → custom
 */
export function categorizeSchedule(expr: string): ScheduleCategory {
  if (!expr) return 'custom'
  const trimmed = expr.trim()
  const shortcut = SHORTCUTS[trimmed.toLowerCase()]
  if (shortcut) return shortcut

  const fields = trimmed.split(/\s+/)
  if (fields.length !== 5) return 'custom'

  const [m, h, dom, , dow] = fields

  // minute granularity: minute field is wildcard or step
  if (m === '*' || /^\*\/\d+$/.test(m)) return 'minute'

  // hourly: hour field is wildcard or step (minute is fixed)
  if (h === '*' || /^\*\/\d+$/.test(h)) return 'hourly'

  // daily: fixed m & h, dom/mon/dow all wildcard
  if (dom === '*' && dow === '*') return 'daily'

  // weekly: dom wildcard, dow specified
  if (dom === '*' && dow !== '*') return 'weekly'

  // monthly: dom specified, dow wildcard
  if (dom !== '*' && dow === '*') return 'monthly'

  return 'custom'
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

export interface CronInsightsInput<
  T extends { id: string; enabled?: boolean; schedule?: { expr?: string } | null },
> {
  jobs: ReadonlyArray<T>
  tagsMap: ReadonlyMap<string, ReadonlyArray<string>>
}

export function computeCronInsights<
  T extends { id: string; enabled?: boolean; schedule?: { expr?: string } | null },
>(input: CronInsightsInput<T>): CronInsights {
  const { jobs, tagsMap } = input
  const total = jobs.length

  const enabledCount = jobs.filter((j) => j.enabled === true).length
  const disabledCount = total - enabledCount
  const enabledPct = total > 0 ? Math.round((enabledCount / total) * 100) : 0

  // Schedule category distribution
  const catCounts = new Map<ScheduleCategory, number>()
  for (const j of jobs) {
    const cat = categorizeSchedule(j.schedule?.expr ?? '')
    catCounts.set(cat, (catCounts.get(cat) ?? 0) + 1)
  }
  const CATEGORY_ORDER: ScheduleCategory[] = [
    'minute',
    'hourly',
    'daily',
    'weekly',
    'monthly',
    'custom',
  ]
  const scheduleCategories = CATEGORY_ORDER.filter((c) => (catCounts.get(c) ?? 0) > 0).map(
    (c) => ({
      category: c,
      count: catCounts.get(c) ?? 0,
      pct: total > 0 ? Math.round(((catCounts.get(c) ?? 0) / total) * 100) : 0,
    }),
  )

  // Tag frequency (each tag across all jobs; tag denominator = total tag instances)
  const tagCounts = new Map<string, number>()
  for (const tags of tagsMap.values()) {
    for (const t of tags) {
      tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1)
    }
  }
  const tagDenom = Array.from(tagCounts.values()).reduce((a, b) => a + b, 0)

  return {
    scheduleCategories,
    enabledCount,
    disabledCount,
    enabledPct,
    topTags: topN(tagCounts, 3, tagDenom),
  }
}
