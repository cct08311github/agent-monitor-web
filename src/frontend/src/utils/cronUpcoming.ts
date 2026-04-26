// ---------------------------------------------------------------------------
// cronUpcoming.ts — merge upcoming fire times across all enabled cron jobs.
// ---------------------------------------------------------------------------

import { nextFireTimes } from './cronNextFires'

export interface UpcomingFire {
  jobId: string
  jobName: string
  ts: number
  date: Date
}

export interface UpcomingInput<T> {
  jobs: ReadonlyArray<T>
  getId: (j: T) => string
  getName: (j: T) => string
  getEnabled: (j: T) => boolean
  getExpr: (j: T) => string
}

/**
 * Compute a merged, chronologically sorted list of upcoming cron fires across
 * all enabled jobs.
 *
 * @param input     - Job collection + accessor functions (generic for testability)
 * @param hoursAhead - Look-ahead window in hours (default 24)
 * @param perJobLimit - Maximum fires collected per job (default 5)
 * @param from      - Reference "now" date (default: current time)
 * @returns Sorted array of UpcomingFire, one entry per expected fire event
 */
export function computeUpcomingFires<T>(
  input: UpcomingInput<T>,
  hoursAhead: number = 24,
  perJobLimit: number = 5,
  from: Date = new Date(),
): UpcomingFire[] {
  const cutoffTs = from.getTime() + hoursAhead * 60 * 60 * 1000
  const out: UpcomingFire[] = []

  for (const j of input.jobs) {
    if (!input.getEnabled(j)) continue

    const expr = input.getExpr(j)
    if (!expr) continue

    const result = nextFireTimes(expr, perJobLimit, from)
    if (!result.supported) continue

    const id = input.getId(j)
    const name = input.getName(j)

    for (const date of result.times) {
      const ts = date.getTime()
      if (ts > cutoffTs) break
      out.push({ jobId: id, jobName: name, ts, date })
    }
  }

  out.sort((a, b) => a.ts - b.ts)
  return out
}
