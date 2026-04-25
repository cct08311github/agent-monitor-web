// ---------------------------------------------------------------------------
// savedSearches.ts — named log-search presets, persisted to localStorage.
// Key: oc_saved_log_searches (separate from legacy filter preset dropdown).
// ---------------------------------------------------------------------------

const KEY = 'oc_saved_log_searches'

export interface SavedSearch {
  id: string
  name: string
  /** The text/regex search string */
  query: string
  /** Log level filter: 'error' | 'warn' | '' */
  level?: string
  /** Agent id filter (reserved for future agentId filter in LogsTab) */
  agentId?: string
  createdAt: number
}

function isValid(o: unknown): o is SavedSearch {
  if (!o || typeof o !== 'object') return false
  const r = o as Record<string, unknown>
  return (
    typeof r.id === 'string' &&
    typeof r.name === 'string' &&
    typeof r.query === 'string' &&
    typeof r.createdAt === 'number' &&
    (r.level === undefined || typeof r.level === 'string') &&
    (r.agentId === undefined || typeof r.agentId === 'string')
  )
}

export function loadSearches(): SavedSearch[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isValid) : []
  } catch {
    return []
  }
}

function saveAll(list: ReadonlyArray<SavedSearch>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    /* silent — quota exceeded or private browsing */
  }
}

export function saveSearch(input: Omit<SavedSearch, 'id' | 'createdAt'>): SavedSearch {
  const now = Date.now()
  const all = loadSearches()
  const existing = all.find((s) => s.name.toLowerCase() === input.name.toLowerCase())
  if (existing) {
    const updated: SavedSearch = { ...existing, ...input, createdAt: now }
    const next = all.map((s) => (s.id === existing.id ? updated : s))
    saveAll(next)
    return updated
  }
  const fresh: SavedSearch = {
    id: `s_${now}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: now,
    ...input,
  }
  saveAll([...all, fresh])
  return fresh
}

export function deleteSearch(id: string): void {
  const next = loadSearches().filter((s) => s.id !== id)
  saveAll(next)
}

export function findByName(name: string): SavedSearch | undefined {
  const target = name.toLowerCase()
  return loadSearches().find((s) => s.name.toLowerCase() === target)
}
