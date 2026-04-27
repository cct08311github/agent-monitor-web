// ---------------------------------------------------------------------------
// sessionsSortPref.ts — sort-order preference for AgentDetail sessions list.
// Persists 'desc' (newest first, default) or 'asc' (oldest first) to
// localStorage so the user's choice survives page reloads.
// ---------------------------------------------------------------------------

export type SortOrder = 'desc' | 'asc'

const KEY = 'oc_sessions_sort_order'
const VALID: ReadonlySet<SortOrder> = new Set(['desc', 'asc'])

export function isValidOrder(s: unknown): s is SortOrder {
  return typeof s === 'string' && VALID.has(s as SortOrder)
}

export function loadSessionsSortOrder(): SortOrder {
  try {
    const raw = localStorage.getItem(KEY)
    return isValidOrder(raw) ? raw : 'desc'
  } catch {
    return 'desc'
  }
}

export function saveSessionsSortOrder(o: SortOrder): void {
  try {
    localStorage.setItem(KEY, o)
  } catch {
    /* silent */
  }
}
