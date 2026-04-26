import { fuzzyScore } from './fuzzyScore'

export interface SearchableCronJob {
  id: string
  name?: string | null
  description?: string | null
  schedule?: { expr?: string } | null
}

/**
 * Filter cron jobs by fuzzy-matching the search query against
 * id, display name (alias-aware), description, and cron expression.
 *
 * @param jobs           - Original job array (not mutated)
 * @param query          - The raw search string
 * @param getDisplayName - Function that resolves the user-visible name for a job
 * @returns Filtered copy; preserves original order (no re-sort)
 */
export function filterCronJobsByQuery<T extends SearchableCronJob>(
  jobs: ReadonlyArray<T>,
  query: string,
  getDisplayName: (j: T) => string,
): T[] {
  const q = query.trim()
  if (!q) return [...jobs]
  return jobs.filter((j) => {
    if (fuzzyScore(q, j.id) > 0) return true
    if (fuzzyScore(q, getDisplayName(j)) > 0) return true
    if (j.description && fuzzyScore(q, j.description) > 0) return true
    const expr = j.schedule?.expr
    if (expr && fuzzyScore(q, expr) > 0) return true
    return false
  })
}
