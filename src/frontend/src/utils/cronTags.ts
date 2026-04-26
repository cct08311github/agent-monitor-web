// ---------------------------------------------------------------------------
// cronTags.ts — per-cron-job tag management, persisted to localStorage.
// Tags are stored as lowercase strings: ['critical', 'weekly', ...]
// ---------------------------------------------------------------------------

const KEY_PREFIX = 'oc_cron_tags:'
const ALL_KEY_REGEX = /^oc_cron_tags:(.+)$/

function key(jobId: string): string {
  return `${KEY_PREFIX}${jobId}`
}

export function loadCronTags(jobId: string): string[] {
  try {
    const raw = localStorage.getItem(key(jobId))
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === 'string') : []
  } catch {
    return []
  }
}

export function saveCronTags(jobId: string, tags: ReadonlyArray<string>): void {
  try {
    if (tags.length) localStorage.setItem(key(jobId), JSON.stringify(tags))
    else localStorage.removeItem(key(jobId))
  } catch {
    /* silent */
  }
}

export function addCronTag(jobId: string, tag: string): string[] {
  const cur = loadCronTags(jobId)
  const norm = tag.trim().toLowerCase()
  if (!norm || cur.includes(norm)) return cur
  const next = [...cur, norm]
  saveCronTags(jobId, next)
  return next
}

export function removeCronTag(jobId: string, tag: string): string[] {
  const cur = loadCronTags(jobId)
  const next = cur.filter((t) => t !== tag)
  saveCronTags(jobId, next)
  return next
}

export function loadAllCronTags(): Map<string, string[]> {
  const out = new Map<string, string[]>()
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (!k) continue
      const m = ALL_KEY_REGEX.exec(k)
      if (!m) continue
      const v = loadCronTags(m[1])
      if (v.length) out.set(m[1], v)
    }
  } catch {
    /* silent */
  }
  return out
}

export function uniqueCronTags(
  allTags: ReadonlyMap<string, ReadonlyArray<string>>,
): { tag: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const tags of allTags.values()) {
    for (const t of tags) counts.set(t, (counts.get(t) ?? 0) + 1)
  }
  return Array.from(counts, ([tag, count]) => ({ tag, count })).sort(
    (a, b) => b.count - a.count || a.tag.localeCompare(b.tag),
  )
}

export function filterJobsByTag<T extends { id: string }>(
  jobs: ReadonlyArray<T>,
  tagsMap: ReadonlyMap<string, ReadonlyArray<string>>,
  selectedTag: string | null,
): T[] {
  if (!selectedTag) return [...jobs]
  return jobs.filter((j) => (tagsMap.get(j.id) ?? []).includes(selectedTag))
}
