import { fuzzyScore } from './fuzzyScore'

export interface SearchableAgent {
  id: string
  name?: string | null
}

/**
 * Filter agents by fuzzy-matching the search query against
 * the agent's display name (alias-aware) and raw id.
 *
 * @param agents     - Original agent array (not mutated)
 * @param query      - The raw search string
 * @param getDisplayName - Function that resolves the user-visible name for an agent
 * @returns Filtered copy; preserves original order (no re-sort)
 */
export function filterAgentsByQuery<T extends SearchableAgent>(
  agents: ReadonlyArray<T>,
  query: string,
  getDisplayName: (a: T) => string,
): T[] {
  const q = query.trim()
  if (!q) return [...agents]
  return agents.filter(
    (a) => fuzzyScore(q, getDisplayName(a)) > 0 || fuzzyScore(q, a.id) > 0,
  )
}
