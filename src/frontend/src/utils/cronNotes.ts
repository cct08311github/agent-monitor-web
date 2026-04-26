// ---------------------------------------------------------------------------
// cronNotes.ts — per-cron-job scratchpad notes, persisted to localStorage.
// Mirrors agentNotes.ts; key prefix: oc_cron_notes:.
// ---------------------------------------------------------------------------

const KEY_PREFIX = 'oc_cron_notes:'

function key(jobId: string): string {
  return `${KEY_PREFIX}${jobId}`
}

export interface CronNote {
  text: string
  updatedAt: number
}

/**
 * Load the note for the given cron job.
 * Returns null if nothing is stored or the stored value is invalid.
 */
export function loadCronNote(jobId: string): CronNote | null {
  try {
    const raw = localStorage.getItem(key(jobId))
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as Record<string, unknown>).text !== 'string' ||
      typeof (parsed as Record<string, unknown>).updatedAt !== 'number'
    ) {
      return null
    }
    return parsed as CronNote
  } catch {
    return null
  }
}

/**
 * Save a note for the given cron job.
 *
 * @param jobId - The cron job identifier
 * @param text  - The note text (empty string is valid)
 * @param now   - Timestamp in epoch ms (defaults to Date.now()); injectable for tests
 */
export function saveCronNote(jobId: string, text: string, now: number = Date.now()): CronNote {
  const note: CronNote = { text, updatedAt: now }
  try {
    localStorage.setItem(key(jobId), JSON.stringify(note))
  } catch {
    /* silent — storage quota errors should not surface as UI errors */
  }
  return note
}

/**
 * Remove the note for the given cron job.
 */
export function clearCronNote(jobId: string): void {
  try {
    localStorage.removeItem(key(jobId))
  } catch {
    /* silent */
  }
}
