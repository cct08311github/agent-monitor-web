// ---------------------------------------------------------------------------
// cronCsvExport.ts — RFC-4180 CSV export for cron jobs.
//
// Columns: id / displayName / cronExpression / description / enabled / tags / archived / pinned
// Filename: cron-jobs-YYYY-MM-DD.csv
// Reuses csvEscape from captureCsvExport (#631).
// ---------------------------------------------------------------------------

import { csvEscape } from './captureCsvExport'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface CronCsvJob {
  id: string
  name?: string | null
  schedule?: { expr?: string } | null
  description?: string | null
  enabled?: boolean
}

export interface CronCsvInput<T extends CronCsvJob> {
  jobs: ReadonlyArray<T>
  aliases: ReadonlyMap<string, string>
  tagsMap: ReadonlyMap<string, ReadonlyArray<string>>
  archivedIds: ReadonlySet<string>
  pinnedIds: ReadonlyArray<string>
}

// ---------------------------------------------------------------------------
// Internal date helpers
// ---------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, '0')

function dateOnly(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

/**
 * Build a CSV string from an array of cron jobs.
 *
 * Columns: id, displayName, cronExpression, description, enabled, tags, archived, pinned
 *
 * `now` is injectable so tests do not need to mock Date.
 */
export function buildCronCsv<T extends CronCsvJob>(
  input: CronCsvInput<T>,
  now: Date = new Date(),
): { filename: string; content: string } {
  const header = [
    'id',
    'displayName',
    'cronExpression',
    'description',
    'enabled',
    'tags',
    'archived',
    'pinned',
  ].join(',')

  const pinSet = new Set(input.pinnedIds)

  const rows = input.jobs.map((j) => {
    const alias = input.aliases.get(j.id) ?? ''
    const displayName = alias || j.name || j.id
    const tags = (input.tagsMap.get(j.id) ?? []).join(' ')

    return [
      csvEscape(j.id),
      csvEscape(displayName),
      csvEscape(j.schedule?.expr ?? ''),
      csvEscape(j.description ?? ''),
      csvEscape(j.enabled === true ? 'true' : 'false'),
      csvEscape(tags),
      csvEscape(input.archivedIds.has(j.id) ? 'true' : 'false'),
      csvEscape(pinSet.has(j.id) ? 'true' : 'false'),
    ].join(',')
  })

  return {
    filename: `cron-jobs-${dateOnly(now)}.csv`,
    content: [header, ...rows].join('\n') + '\n',
  }
}
