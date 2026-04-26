// ---------------------------------------------------------------------------
// logsCsvExport.ts — RFC-4180 CSV export for filtered gateway log entries.
//
// Columns: timestamp / level / agent / message
// Filename: logs-YYYY-MM-DD-HHmm.csv
// ---------------------------------------------------------------------------

import { csvEscape } from './captureCsvExport'
import type { LogEntry } from './logsJsonExport'

// ---------------------------------------------------------------------------
// Internal date helpers
// ---------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, '0')

function timestampSlug(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`
}

function formatLogTimestamp(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

/**
 * Serialises an array of log entries into a CSV file payload.
 *
 * Columns: timestamp, level, agent, message
 *
 * `now` is injectable so tests do not need to mock `Date`.
 */
export function buildLogsCsv(
  entries: ReadonlyArray<LogEntry>,
  now: Date = new Date(),
): { filename: string; content: string } {
  const header = ['timestamp', 'level', 'agent', 'message'].join(',')
  const rows = entries.map((e) =>
    [
      csvEscape(formatLogTimestamp(e.ts)),
      csvEscape(e.level ?? ''),
      csvEscape(e.agent ?? ''),
      csvEscape(e.message),
    ].join(','),
  )
  return {
    filename: `logs-${timestampSlug(now)}.csv`,
    content: [header, ...rows].join('\n') + '\n',
  }
}
