// ---------------------------------------------------------------------------
// alertsCsvExport.ts — RFC-4180 CSV export for alerts.
//
// Columns: rule / message / level / firstSeen / lastSeen / snoozed
// Filename: alerts-YYYY-MM-DD-HHmm.csv
// ---------------------------------------------------------------------------

import { csvEscape } from './captureCsvExport'

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface AlertForCsv {
  id: string
  rule?: string | null
  message?: string | null
  level?: string | null
  firstSeen?: number | string | null
  lastSeen?: number | string | null
  ts?: number | string | null
}

// ---------------------------------------------------------------------------
// Internal date helpers
// ---------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, '0')

function dateOnly(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function timestampSlug(d: Date): string {
  return `${dateOnly(d)}-${pad(d.getHours())}${pad(d.getMinutes())}`
}

function formatTs(v: number | string | null | undefined): string {
  if (v == null) return ''
  const t = typeof v === 'number' ? v : Date.parse(v)
  if (!Number.isFinite(t)) return ''
  const d = new Date(t)
  return `${dateOnly(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

/**
 * Serialises an array of alerts into a CSV file payload.
 *
 * Columns: rule, message, level, firstSeen, lastSeen, snoozed
 *
 * `firstSeen` falls back to `ts` when `firstSeen` is absent.
 * `lastSeen` falls back to `ts` when `lastSeen` is absent.
 * `snoozed` is 'true' when the alert id is in `snoozedIds`, 'false' otherwise.
 *
 * `now` is injectable so tests do not need to mock `Date`.
 */
export function buildAlertsCsv(
  alerts: ReadonlyArray<AlertForCsv>,
  snoozedIds: ReadonlyArray<string>,
  now: Date = new Date(),
): { filename: string; content: string } {
  const header = ['rule', 'message', 'level', 'firstSeen', 'lastSeen', 'snoozed'].join(',')
  const snoozeSet = new Set(snoozedIds)
  const rows = alerts.map((a) =>
    [
      csvEscape(a.rule ?? ''),
      csvEscape(a.message ?? ''),
      csvEscape(a.level ?? ''),
      csvEscape(formatTs(a.firstSeen ?? a.ts)),
      csvEscape(formatTs(a.lastSeen ?? a.ts)),
      csvEscape(snoozeSet.has(a.id) ? 'true' : 'false'),
    ].join(','),
  )
  return {
    filename: `alerts-${timestampSlug(now)}.csv`,
    content: [header, ...rows].join('\n') + '\n',
  }
}
