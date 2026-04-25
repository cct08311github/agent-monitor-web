/**
 * costHeatmap.ts
 *
 * Utilities for building a 7×24 cost heatmap matrix from minute-bucket
 * cost history data.  Rows = day-of-week (0=Sun … 6=Sat), cols = hour (0–23).
 */

export interface HeatmapBucket {
  dayOfWeek: number // 0=Sunday, 6=Saturday
  hour: number      // 0-23
  cost: number      // accumulated cost in this bucket
}

export interface CostPoint {
  ts: string        // ISO timestamp
  total_cost: number
}

// ---------------------------------------------------------------------------
// computeHeatmapBuckets
// ---------------------------------------------------------------------------

/**
 * Build a 7×24 matrix from `costHistory`.
 *
 * Each entry `matrix[dayOfWeek][hour]` holds the accumulated cost for that
 * (day, hour) slot across all data points in the last 7 days.
 *
 * @param costHistory - Array of minute-bucket cost points from `/api/read/history`
 * @returns 7×24 matrix, rows indexed by Date.getDay() (0=Sun), cols by hour (0-23)
 */
export function computeHeatmapBuckets(costHistory: CostPoint[]): HeatmapBucket[][] {
  // Initialise an empty 7×24 matrix
  const matrix: HeatmapBucket[][] = Array.from({ length: 7 }, (_, dow) =>
    Array.from({ length: 24 }, (__, hr) => ({
      dayOfWeek: dow,
      hour: hr,
      cost: 0,
    })),
  )

  if (costHistory.length === 0) {
    return matrix
  }

  const now = Date.now()
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000

  for (const point of costHistory) {
    const ts = Date.parse(point.ts)
    if (Number.isNaN(ts)) continue
    // Only consider data within the last 7 days
    if (now - ts > sevenDaysMs) continue

    const date = new Date(ts)
    const dow = date.getDay()       // 0=Sun … 6=Sat
    const hr = date.getHours()      // 0–23

    matrix[dow][hr].cost += point.total_cost
  }

  return matrix
}

// ---------------------------------------------------------------------------
// maxBucketCost
// ---------------------------------------------------------------------------

/**
 * Return the maximum cost value across all non-zero cells in the matrix.
 * Returns 0 when the matrix is empty or all cells are zero.
 */
export function maxBucketCost(matrix: HeatmapBucket[][]): number {
  let max = 0
  for (const row of matrix) {
    for (const cell of row) {
      if (cell.cost > max) {
        max = cell.cost
      }
    }
  }
  return max
}

// ---------------------------------------------------------------------------
// colorForCost
// ---------------------------------------------------------------------------

/**
 * Map a cost value to one of 5 colour tiers using a simple 4-step scale.
 *
 * Tier | Range              | Colour
 * -----|--------------------|----------
 *  0   | cost === 0 (or max=0) | transparent
 *  1   | (0, 0.25 × max]    | #fee5d9  (lightest red)
 *  2   | (0.25, 0.50 × max] | #fcae91
 *  3   | (0.50, 0.75 × max] | #fb6a4a
 *  4   | (0.75, max]        | #cb181d  (darkest red)
 */
export function colorForCost(cost: number, max: number): string {
  if (max === 0 || cost === 0) return 'transparent'

  const ratio = cost / max
  if (ratio <= 0.25) return '#fee5d9'
  if (ratio <= 0.5) return '#fcae91'
  if (ratio <= 0.75) return '#fb6a4a'
  return '#cb181d'
}
