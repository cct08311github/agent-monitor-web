// ---------------------------------------------------------------------------
// sessionsCsvExport.ts — RFC-4180 CSV export for agent sessions.
//
// Columns: id / createdAt / preview / title / bookmarked
// Filename: sessions-{agentId}-YYYY-MM-DD.csv
// ---------------------------------------------------------------------------

import { csvEscape } from './captureCsvExport'

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface SessionForCsv {
  id: string
  createdAt?: number | string | null
  preview?: string | null
  title?: string | null
  firstMessage?: string | null
}

// ---------------------------------------------------------------------------
// Internal date helpers
// ---------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, '0')

function dateOnly(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function formatSessionTimestamp(ts: number | string | null | undefined): string {
  if (ts == null) return ''
  const t = typeof ts === 'number' ? ts : Date.parse(ts)
  if (!Number.isFinite(t)) return ''
  const d = new Date(t)
  return `${dateOnly(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

/**
 * Serialises an array of sessions into a CSV file payload.
 *
 * Columns: id, createdAt, preview, title, bookmarked
 *
 * `preview` falls back to `firstMessage` when `preview` is absent.
 * `bookmarked` is 'true' when the session id is in `bookmarkedIds`, 'false' otherwise.
 *
 * `now` is injectable so tests do not need to mock `Date`.
 */
export function buildSessionsCsv(
  agentId: string,
  sessions: ReadonlyArray<SessionForCsv>,
  bookmarkedIds: ReadonlyArray<string>,
  now: Date = new Date(),
): { filename: string; content: string } {
  const header = ['id', 'createdAt', 'preview', 'title', 'bookmarked'].join(',')
  const bookSet = new Set(bookmarkedIds)
  const rows = sessions.map((s) => {
    const previewSrc = s.preview ?? s.firstMessage ?? ''
    return [
      csvEscape(s.id),
      csvEscape(formatSessionTimestamp(s.createdAt)),
      csvEscape(previewSrc),
      csvEscape(s.title ?? ''),
      csvEscape(bookSet.has(s.id) ? 'true' : 'false'),
    ].join(',')
  })
  return {
    filename: `sessions-${agentId || 'unknown'}-${dateOnly(now)}.csv`,
    content: [header, ...rows].join('\n') + '\n',
  }
}
