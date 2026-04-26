// ---------------------------------------------------------------------------
// cronJsonExport.ts — round-trippable JSON backup for cron jobs.
//
// Persists full state: jobs + aliases + tags + pinned + archived.
// Designed for device migration and general-purpose backup.
//
// Mirrors captureExportJson.ts (#579) and completes the JSON four-piece
// export parity (captures / logs / sessions / cron).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface CronBackup {
  version: '1'
  exportedAt: number
  jobs: unknown[]
  aliases: Record<string, string>
  tags: Record<string, string[]>
  pinned: string[]
  archived: string[]
}

export interface CronBackupInput {
  jobs: ReadonlyArray<unknown>
  aliases: ReadonlyMap<string, string>
  tagsMap: ReadonlyMap<string, ReadonlyArray<string>>
  pinned: ReadonlyArray<string>
  archived: ReadonlyArray<string>
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, '0')

function dateOnly(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

/**
 * Builds a versioned CronBackup from the supplied state and returns
 * a filename + JSON string ready for download.
 *
 * `now` is injectable so tests do not need to mock Date.
 */
export function buildCronJson(
  input: CronBackupInput,
  now: Date = new Date(),
): { filename: string; content: string } {
  const aliases: Record<string, string> = {}
  for (const [k, v] of input.aliases) aliases[k] = v

  const tags: Record<string, string[]> = {}
  for (const [k, v] of input.tagsMap) tags[k] = [...v]

  const payload: CronBackup = {
    version: '1',
    exportedAt: now.getTime(),
    jobs: [...input.jobs],
    aliases,
    tags,
    pinned: [...input.pinned],
    archived: [...input.archived],
  }

  return {
    filename: `cron-jobs-${dateOnly(now)}.json`,
    content: JSON.stringify(payload, null, 2),
  }
}
