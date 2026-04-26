import { fuzzyScore } from './fuzzyScore'

export interface SearchableSession {
  id: string
  preview?: string | null
  firstMessage?: string | null
  title?: string | null
}

/**
 * Filter sessions by fuzzy-matching the search query against
 * the session's id, preview, firstMessage, and title fields.
 *
 * @param sessions - Original session array (not mutated)
 * @param query    - The raw search string
 * @returns Filtered copy; preserves original order (no re-sort)
 */
export function filterSessionsByQuery<T extends SearchableSession>(
  sessions: ReadonlyArray<T>,
  query: string,
): T[] {
  const q = query.trim()
  if (!q) return [...sessions]
  return sessions.filter((s) => {
    if (fuzzyScore(q, s.id) > 0) return true
    if (s.preview && fuzzyScore(q, s.preview) > 0) return true
    if (s.firstMessage && fuzzyScore(q, s.firstMessage) > 0) return true
    if (s.title && fuzzyScore(q, s.title) > 0) return true
    return false
  })
}
