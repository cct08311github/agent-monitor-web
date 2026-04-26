// ---------------------------------------------------------------------------
// captureCsvExport.ts — RFC-4180 CSV export for quick captures.
//
// Columns: timestamp / context / body / tags
// Tags are extracted from the capture body using extractTags().
// Filename: quick-captures-YYYY-MM-DD.csv
// ---------------------------------------------------------------------------

import type { Capture } from './quickCapture'
import { extractTags } from './quickCaptureTags'

// ---------------------------------------------------------------------------
// RFC-4180 escape
// ---------------------------------------------------------------------------

/**
 * Escape a single CSV field per RFC 4180:
 * - Fields containing comma, double-quote, CR, or LF are wrapped in double-quotes.
 * - Internal double-quotes are doubled.
 */
export function csvEscape(s: string): string {
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

// ---------------------------------------------------------------------------
// Internal date helpers (shared with captureExportJson pattern)
// ---------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, '0')

function dateOnly(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts)
  return `${dateOnly(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

/**
 * Build a CSV string from an array of captures.
 *
 * Columns: timestamp, context, body, tags
 * Tags are the space-joined result of extractTags(body).
 *
 * `now` is injectable so tests do not need to mock Date.
 */
export function buildCaptureCsv(
  captures: ReadonlyArray<Capture>,
  now: Date = new Date(),
): { filename: string; content: string } {
  const header = ['timestamp', 'context', 'body', 'tags'].join(',')
  const rows = captures.map((c) => {
    const tags = extractTags(c.body).join(' ')
    return [
      csvEscape(formatTimestamp(c.createdAt)),
      csvEscape(c.context),
      csvEscape(c.body),
      csvEscape(tags),
    ].join(',')
  })
  return {
    filename: `quick-captures-${dateOnly(now)}.csv`,
    content: [header, ...rows].join('\n') + '\n',
  }
}
