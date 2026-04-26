// ---------------------------------------------------------------------------
// commandGroupCollapse.ts — per-category collapse state for CommandPalette,
// persisted to localStorage.  Same design language as sessionBookmarks.ts.
// ---------------------------------------------------------------------------

const KEY = 'oc_cmd_collapsed_groups'

export function loadCollapsed(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return new Set()
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((s): s is string => typeof s === 'string'))
  } catch {
    return new Set()
  }
}

export function saveCollapsed(set: ReadonlySet<string>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(Array.from(set)))
  } catch {
    /* silent — storage quota or private browsing */
  }
}

export function toggleCollapsed(set: ReadonlySet<string>, category: string): Set<string> {
  const next = new Set(set)
  if (next.has(category)) {
    next.delete(category)
  } else {
    next.add(category)
  }
  return next
}

export function isCollapsed(set: ReadonlySet<string>, category: string): boolean {
  return set.has(category)
}
