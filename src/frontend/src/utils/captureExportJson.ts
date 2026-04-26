// ---------------------------------------------------------------------------
// captureExportJson.ts — round-trippable JSON backup/restore for quick captures.
//
// Persists the full state: captures + archivedIds + pinnedIds.
// Designed for device migration and general-purpose backup.
//
// Storage keys written on restore:
//   oc_quick_captures   — Capture[]
//   oc_capture_archived — string[] (archived id list)
//   oc_capture_pinned   — string[] (pinned id list)
// ---------------------------------------------------------------------------

import type { Capture } from './quickCapture'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface CaptureBackup {
  version: '1'
  exportedAt: number
  captures: Capture[]
  archivedIds: string[]
  pinnedIds: string[]
}

export interface CaptureBackupInput {
  captures: ReadonlyArray<Capture>
  archivedIds: ReadonlyArray<string>
  pinnedIds: ReadonlyArray<string>
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, '0')

function dateOnly(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function isValidCapture(o: unknown): o is Capture {
  if (!o || typeof o !== 'object') return false
  const r = o as Record<string, unknown>
  return (
    typeof r.id === 'string' &&
    typeof r.body === 'string' &&
    typeof r.context === 'string' &&
    typeof r.createdAt === 'number'
  )
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

/**
 * Builds a versioned CaptureBackup from the supplied state and returns
 * a filename + JSON string ready for download.
 *
 * `now` is injectable so tests do not need to mock Date.
 */
export function buildCaptureBackup(
  input: CaptureBackupInput,
  now: Date = new Date(),
): { filename: string; content: string } {
  const backup: CaptureBackup = {
    version: '1',
    exportedAt: now.getTime(),
    captures: [...input.captures],
    archivedIds: [...input.archivedIds],
    pinnedIds: [...input.pinnedIds],
  }
  return {
    filename: `quick-captures-backup-${dateOnly(now)}.json`,
    content: JSON.stringify(backup, null, 2),
  }
}

// ---------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------

/**
 * Parses a JSON string into a CaptureBackup.
 * Returns null if the JSON is malformed or fails schema validation.
 * Invalid individual entries are filtered out rather than failing the whole parse.
 */
export function parseCaptureBackup(json: string): CaptureBackup | null {
  try {
    const parsed = JSON.parse(json)
    if (!parsed || typeof parsed !== 'object') return null
    const r = parsed as Record<string, unknown>
    if (r.version !== '1') return null
    if (typeof r.exportedAt !== 'number') return null
    if (!Array.isArray(r.captures)) return null
    if (!Array.isArray(r.archivedIds)) return null
    if (!Array.isArray(r.pinnedIds)) return null
    const captures = (r.captures as unknown[]).filter(isValidCapture)
    const archivedIds = (r.archivedIds as unknown[]).filter(
      (s): s is string => typeof s === 'string',
    )
    const pinnedIds = (r.pinnedIds as unknown[]).filter((s): s is string => typeof s === 'string')
    return { version: '1', exportedAt: r.exportedAt, captures, archivedIds, pinnedIds }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Restore
// ---------------------------------------------------------------------------

/**
 * Overwrites the three capture-related localStorage keys with data from the
 * supplied backup. This is destructive — callers must confirm with the user first.
 */
export function restoreCaptureBackup(backup: CaptureBackup): void {
  try {
    localStorage.setItem('oc_quick_captures', JSON.stringify(backup.captures))
    localStorage.setItem('oc_capture_archived', JSON.stringify(backup.archivedIds))
    localStorage.setItem('oc_capture_pinned', JSON.stringify(backup.pinnedIds))
  } catch {
    /* silent — storage quota or private-mode write failure */
  }
}
