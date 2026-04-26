import { fuzzyScore } from './fuzzyScore'

export interface SearchableAlert {
  rule?: string | null
  message?: string | null
  description?: string | null
}

/**
 * Filter alerts by fuzzy-matching the search query against
 * the alert's rule, message, and description fields.
 *
 * @param alerts - Original alert array (not mutated)
 * @param query  - The raw search string
 * @returns Filtered copy; preserves original order (no re-sort)
 */
export function filterAlertsByQuery<T extends SearchableAlert>(
  alerts: ReadonlyArray<T>,
  query: string,
): T[] {
  const q = query.trim()
  if (!q) return [...alerts]
  return alerts.filter((a) => {
    if (a.rule && fuzzyScore(q, a.rule) > 0) return true
    if (a.message && fuzzyScore(q, a.message) > 0) return true
    if (a.description && fuzzyScore(q, a.description) > 0) return true
    return false
  })
}
