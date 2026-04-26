// ---------------------------------------------------------------------------
// logsJsonExport.ts — JSON export for filtered gateway log entries.
//
// Produces a single JSON file containing:
//   { exportedAt, filter, entries }
//
// Designed for offline analysis; the filter block documents exactly which
// criteria were active when the export was triggered.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface LogEntry {
  ts: number
  level?: string
  agent?: string
  message: string
}

export interface LogsExportFilter {
  query?: string
  level?: string
  agentId?: string
  regex?: boolean
}

export interface LogsExportInput {
  entries: ReadonlyArray<LogEntry>
  filter: LogsExportFilter
}

export interface LogsExportOutput {
  filename: string
  content: string
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, '0')

function timestampSlug(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

/**
 * Serialises the filtered log state into a JSON file payload.
 *
 * Only defined filter fields are included in the `filter` block — callers
 * should pass `undefined` (or omit) for fields that are not active.
 *
 * `now` is injectable so tests do not need to mock `Date`.
 */
export function buildLogsJson(
  input: LogsExportInput,
  now: Date = new Date(),
): LogsExportOutput {
  // Build a clean filter object: omit falsy/undefined values so the exported
  // JSON only contains fields that were actually active.
  const cleanFilter: Record<string, unknown> = {}
  if (input.filter.query) cleanFilter.query = input.filter.query
  if (input.filter.level) cleanFilter.level = input.filter.level
  if (input.filter.agentId) cleanFilter.agentId = input.filter.agentId
  if (input.filter.regex) cleanFilter.regex = input.filter.regex

  const payload = {
    exportedAt: now.getTime(),
    filter: cleanFilter,
    entries: [...input.entries],
  }

  return {
    filename: `logs-${timestampSlug(now)}.json`,
    content: JSON.stringify(payload, null, 2),
  }
}
