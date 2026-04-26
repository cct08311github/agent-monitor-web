// ---------------------------------------------------------------------------
// logsMarkdownExport.ts — Markdown export for filtered gateway log entries.
//
// Mirrors sessionsMarkdownExport.ts (#667) pattern for logs.
// Pure utility (no DOM, no localStorage) — easy to unit test.
//
// Filename: logs-YYYY-MM-DD-HHmm.md
// ---------------------------------------------------------------------------

import type { LogEntry, LogsExportFilter } from './logsJsonExport'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface LogsMdInput {
  entries: ReadonlyArray<LogEntry>
  filter: LogsExportFilter
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const LEVEL_EMOJI: Record<string, string> = {
  error: '🔴',
  warn: '⚠️',
  warning: '⚠️',
  info: 'ℹ️',
  debug: '🐛',
}

const pad = (n: number) => String(n).padStart(2, '0')

function dateOnly(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function timestampSlug(d: Date): string {
  return `${dateOnly(d)}-${pad(d.getHours())}${pad(d.getMinutes())}`
}

function formatTs(ts: number): string {
  const d = new Date(ts)
  return `${dateOnly(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function levelEmoji(level: string | undefined): string {
  if (!level) return '·'
  return LEVEL_EMOJI[level.toLowerCase()] ?? '·'
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

/**
 * Builds the filename and Markdown content for a logs export.
 *
 * - Generates a header with export time, entry count, and active filter summary.
 * - Each entry is a list item with level emoji, timestamp, optional agent, and message.
 * - Empty entries render a "無 logs" placeholder.
 *
 * `now` is injectable so tests do not need to mock `Date`.
 */
export function buildLogsMarkdown(
  input: LogsMdInput,
  now: Date = new Date(),
): { filename: string; content: string } {
  const filename = `logs-${timestampSlug(now)}.md`
  const lines: string[] = [
    `# Logs Export`,
    '',
    `**匯出時間:** ${formatTs(now.getTime())}`,
    `**Entries:** ${input.entries.length}`,
  ]

  // Filter summary — only include fields that are actually active
  const filterParts: string[] = []
  if (input.filter.query) filterParts.push(`query: \`${input.filter.query}\``)
  if (input.filter.level) filterParts.push(`level: ${input.filter.level}`)
  if (input.filter.agentId) filterParts.push(`agent: ${input.filter.agentId}`)
  if (input.filter.regex) filterParts.push('regex: true')
  if (filterParts.length > 0) {
    lines.push(`**Filter:** ${filterParts.join(' · ')}`)
  }

  lines.push('', '---', '')

  if (input.entries.length === 0) {
    lines.push('_無 logs_')
  } else {
    for (const e of input.entries) {
      const emoji = levelEmoji(e.level)
      const agent = e.agent ? ` \`${e.agent}\`` : ''
      lines.push(`- ${emoji} **${formatTs(e.ts)}**${agent} ${e.message}`)
    }
  }

  return { filename, content: lines.join('\n') + '\n' }
}
