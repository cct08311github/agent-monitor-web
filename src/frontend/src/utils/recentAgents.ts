// ---------------------------------------------------------------------------
// recentAgents.ts — track recently-visited agent IDs in localStorage.
// Max 10 stored; oldest pushed out as new visits arrive.
// ---------------------------------------------------------------------------

const KEY = 'oc_recent_agents'
const MAX = 10

export function loadRecents(): string[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === 'string') : []
  } catch {
    return []
  }
}

function saveRecents(list: ReadonlyArray<string>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    /* silent — private-browsing or storage quota */
  }
}

/**
 * Record a visit to `agentId`.
 * Moves the id to the front; deduplicates; caps at MAX.
 * Returns the updated list.
 */
export function recordVisit(agentId: string): string[] {
  const cur = loadRecents()
  const without = cur.filter((id) => id !== agentId)
  const next = [agentId, ...without].slice(0, MAX)
  saveRecents(next)
  return next
}

export function clearRecents(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* silent */
  }
}
