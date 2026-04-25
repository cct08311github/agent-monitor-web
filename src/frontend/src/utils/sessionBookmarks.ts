// ---------------------------------------------------------------------------
// sessionBookmarks.ts — per-agent session pinning, persisted to localStorage.
// Same design language as CommandPalette favorites (recents + favorites).
// ---------------------------------------------------------------------------

const KEY_PREFIX = 'oc_session_bookmarks:'

function key(agentId: string): string {
  return `${KEY_PREFIX}${agentId}`
}

export function loadBookmarks(agentId: string): string[] {
  try {
    const raw = localStorage.getItem(key(agentId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === 'string') : []
  } catch {
    return []
  }
}

export function saveBookmarks(agentId: string, ids: string[]): void {
  try {
    localStorage.setItem(key(agentId), JSON.stringify(ids))
  } catch {
    /* silent */
  }
}

export function toggleBookmark(agentId: string, sessionId: string): string[] {
  const list = loadBookmarks(agentId)
  const idx = list.indexOf(sessionId)
  const next = idx >= 0 ? list.filter((id) => id !== sessionId) : [...list, sessionId]
  saveBookmarks(agentId, next)
  return next
}

export function isBookmarked(bookmarks: string[], sessionId: string): boolean {
  return bookmarks.includes(sessionId)
}

export interface PartitionResult<T> {
  pinned: T[]
  rest: T[]
}

export function partition<T extends { id: string }>(
  items: T[],
  bookmarks: string[],
): PartitionResult<T> {
  const set = new Set(bookmarks)
  const pinned: T[] = []
  const rest: T[] = []
  for (const it of items) {
    if (set.has(it.id)) pinned.push(it)
    else rest.push(it)
  }
  // Preserve bookmark click order in pinned region
  pinned.sort((a, b) => bookmarks.indexOf(a.id) - bookmarks.indexOf(b.id))
  return { pinned, rest }
}
