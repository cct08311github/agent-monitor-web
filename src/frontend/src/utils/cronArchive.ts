// ---------------------------------------------------------------------------
// cronArchive.ts — localStorage-backed archive set for cron jobs.
//
// Archived cron jobs are hidden from the main active list but preserved in
// storage. This is distinct from deletion — archived jobs can be restored.
//
// Persistence key: 'oc_cron_archived'
// ---------------------------------------------------------------------------

const KEY = 'oc_cron_archived'

/** Load the set of archived cron job IDs from localStorage. */
export function loadArchived(): Set<string> {
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

/** Persist the archived set to localStorage. */
export function saveArchived(set: ReadonlySet<string>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(Array.from(set)))
  } catch {
    /* silent — storage quota or private-mode write failure */
  }
}

/**
 * Archive a cron job by id.
 * Returns the updated archived set (both in-memory and persisted).
 */
export function archiveJob(id: string): Set<string> {
  const cur = loadArchived()
  const next = new Set(cur)
  next.add(id)
  saveArchived(next)
  return next
}

/**
 * Unarchive (restore) a cron job by id.
 * Returns the updated archived set.
 */
export function unarchiveJob(id: string): Set<string> {
  const cur = loadArchived()
  const next = new Set(cur)
  next.delete(id)
  saveArchived(next)
  return next
}

/** Check whether a cron job id is in the archived set. */
export function isArchived(set: ReadonlySet<string>, id: string): boolean {
  return set.has(id)
}
