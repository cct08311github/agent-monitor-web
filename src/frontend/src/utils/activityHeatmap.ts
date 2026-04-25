/**
 * activityHeatmap.ts
 *
 * Pure utility functions for building a GitHub-contribution-graph-style
 * 7 weeks × 7 days activity heatmap grid.
 *
 * Design choices:
 * - All date math uses LOCAL timezone (getFullYear / getMonth / getDate)
 *   to match user expectations.  Never toISOString() (UTC).
 * - Grid is column-major: outer array = weeks (left → right), inner array =
 *   day-of-week (0=Sun … 6=Sat, top → bottom).
 * - The last column ends with "today"; earlier columns are full 7-day weeks.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface DailyCount {
  /** Local-timezone YYYY-MM-DD key */
  dateKey: string
  count: number
  date: Date
}

export interface GridCell {
  date: Date
  /** YYYY-MM-DD (local timezone) */
  key: string
  /** 0=Sun … 6=Sat */
  dayOfWeek: number
  /**
   * false for cells that are:
   *  • beyond today (future day in the current week-column)
   *  • padding cells needed to fill the leftmost week to start on Sunday
   */
  inRange: boolean
}

// ---------------------------------------------------------------------------
// dateKey — local-timezone YYYY-MM-DD string
// ---------------------------------------------------------------------------

export function dateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// ---------------------------------------------------------------------------
// bucketByDay — aggregate a collection of timestamped items into a day→count map
// ---------------------------------------------------------------------------

type TimestampedItem = { createdAt: number | string | Date }

export function bucketByDay(
  items: ReadonlyArray<TimestampedItem>,
): Map<string, number> {
  const map = new Map<string, number>()

  for (const item of items) {
    let d: Date
    if (item.createdAt instanceof Date) {
      d = item.createdAt
    } else if (typeof item.createdAt === 'number') {
      d = new Date(item.createdAt)
    } else {
      // string — could be ISO or epoch as string
      const n = Number(item.createdAt)
      d = Number.isNaN(n) ? new Date(item.createdAt) : new Date(n)
    }

    if (!Number.isFinite(d.getTime())) continue

    const k = dateKey(d)
    map.set(k, (map.get(k) ?? 0) + 1)
  }

  return map
}

// ---------------------------------------------------------------------------
// intensityBucket — map a raw count to 0-4 intensity tier
//
//  0 → 0          (empty)
//  1-2 → 1        (light)
//  3-5 → 2        (moderate)
//  6-10 → 3       (active)
//  11+ → 4        (very active)
// ---------------------------------------------------------------------------

export function intensityBucket(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0
  if (count <= 2) return 1
  if (count <= 5) return 2
  if (count <= 10) return 3
  return 4
}

// ---------------------------------------------------------------------------
// buildGrid — construct the weeks×7 grid
// ---------------------------------------------------------------------------

/**
 * Build a column-major grid of `weeks` columns × 7 rows.
 *
 * The last column ends with `today` (today.getDay() is the last filled row;
 * rows for days after today within that column are marked `inRange: false`).
 *
 * The leftmost column starts on the Sunday that is exactly (weeks - 1) full
 * weeks before the Sunday that starts the column containing `today`.
 */
export function buildGrid(today: Date, weeks: number): GridCell[][] {
  // Anchor: the Sunday at the start of today's week
  const todayDow = today.getDay() // 0=Sun … 6=Sat
  const todayKey = dateKey(today)

  // Number of days back to the most recent Sunday (start of current week)
  const daysToSundayOfThisWeek = todayDow

  // Build the calendar date for cell [col][row] using offsets from `today`.
  // col 0 is the leftmost (oldest) week, col (weeks-1) is the current week.
  // row 0 = Sunday, row 6 = Saturday.

  const grid: GridCell[][] = []

  for (let col = 0; col < weeks; col++) {
    const column: GridCell[] = []

    for (let row = 0; row < 7; row++) {
      // How many days ago is this cell relative to today?
      // Current week Sunday is `daysToSundayOfThisWeek` days ago.
      // Each earlier column adds 7 days.
      // Within a column, row 0=Sunday, row 6=Saturday.
      const daysAgo =
        daysToSundayOfThisWeek + (weeks - 1 - col) * 7 - row

      // Positive daysAgo = in the past, 0 = today, negative = future
      const cellDate = new Date(today)
      cellDate.setDate(today.getDate() - daysAgo)

      const k = dateKey(cellDate)
      const inRange = daysAgo >= 0 && k <= todayKey

      column.push({
        date: cellDate,
        key: k,
        dayOfWeek: row,
        inRange,
      })
    }

    grid.push(column)
  }

  return grid
}
