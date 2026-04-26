/**
 * cronStats.ts — aggregate statistics for CronTab.
 *
 * Computes summary counts (total, enabled, archived, pinned, unique tags)
 * from the full jobs array plus the archived / pinned / tags side-channel stores.
 */

export interface CronStats {
  total: number
  enabled: number
  archived: number
  pinned: number
  tagCount: number
}

export interface CronStatsInput<T extends { id: string; enabled?: boolean }> {
  jobs: ReadonlyArray<T>
  archivedIds: ReadonlySet<string>
  pinnedIds: ReadonlyArray<string>
  tagsMap: ReadonlyMap<string, ReadonlyArray<string>>
}

/**
 * Compute aggregate stats across all cron jobs.
 *
 * @param input.jobs        - Full list of all cron jobs.
 * @param input.archivedIds - Set of IDs that are currently archived.
 * @param input.pinnedIds   - Ordered array of IDs that are currently pinned.
 * @param input.tagsMap     - Map of jobId → tag array.
 */
export function computeCronStats<T extends { id: string; enabled?: boolean }>(
  input: CronStatsInput<T>,
): CronStats {
  const { jobs, archivedIds, pinnedIds, tagsMap } = input
  const pinSet = new Set(pinnedIds)

  const total = jobs.length
  const enabled = jobs.filter((j) => j.enabled === true).length
  const archived = jobs.filter((j) => archivedIds.has(j.id)).length
  const pinned = jobs.filter((j) => pinSet.has(j.id)).length

  const uniqueTags = new Set<string>()
  for (const tags of tagsMap.values()) {
    for (const t of tags) {
      uniqueTags.add(t)
    }
  }

  return { total, enabled, archived, pinned, tagCount: uniqueTags.size }
}
