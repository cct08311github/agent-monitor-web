// ---------------------------------------------------------------------------
// alertsMarkdownExport.ts — Markdown export for alerts.
//
// Mirrors cronMarkdownExport.ts (#677) pattern for alerts.
// Pure utility (no DOM, no localStorage) — easy to unit test.
//
// Features:
//   - Header with export time + alert summary (total / snoozed)
//   - Per-alert section: level emoji, rule name, message, timestamps
//   - Snoozed alerts show ☕ prefix
//   - Level emoji: 🔴 critical/error, ⚠️ warn/warning, ℹ️ info, · otherwise
//
// Filename: alerts-YYYY-MM-DD-HHmm.md
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface AlertForMd {
  id: string
  rule?: string | null
  message?: string | null
  level?: string | null
  firstSeen?: number | string | null
  lastSeen?: number | string | null
  ts?: number | string | null
}

// ---------------------------------------------------------------------------
// Internal constants and helpers
// ---------------------------------------------------------------------------

const LEVEL_EMOJI: Record<string, string> = {
  critical: '🔴',
  error: '🔴',
  warn: '⚠️',
  warning: '⚠️',
  info: 'ℹ️',
}

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

function levelEmoji(level: string | undefined | null): string {
  if (!level) return '·'
  return LEVEL_EMOJI[level.toLowerCase()] ?? '·'
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

/**
 * Builds the filename and Markdown content for an alerts export.
 *
 * - Generates a header with export time and alert counts (total / snoozed).
 * - Each alert is an H2 section with level emoji, rule name, message, level, and timestamps.
 * - Snoozed alerts are prefixed with ☕.
 * - Level emoji applied per severity: 🔴 critical/error, ⚠️ warn/warning, ℹ️ info, · otherwise.
 * - Empty alerts list renders a "_無 alerts_" placeholder.
 *
 * `now` is injectable so tests do not need to mock `Date`.
 */
export function buildAlertsMarkdown(
  alerts: ReadonlyArray<AlertForMd>,
  snoozedIds: ReadonlyArray<string>,
  now: Date = new Date(),
): { filename: string; content: string } {
  const filename = `alerts-${timestampSlug(now)}.md`
  const total = alerts.length
  const snoozeSet = new Set(snoozedIds)

  const lines: string[] = [
    `# Alerts Export`,
    '',
    `**匯出時間:** ${formatTs(now.getTime())}`,
    `**總數:** ${total} alerts (${snoozedIds.length} snoozed)`,
    '',
    '---',
    '',
  ]

  if (!total) {
    lines.push('_無 alerts_')
    return { filename, content: lines.join('\n') + '\n' }
  }

  for (const a of alerts) {
    const emoji = levelEmoji(a.level)
    const snooze = snoozeSet.has(a.id) ? '☕ ' : ''
    const rule = a.rule || a.id
    lines.push(`## ${emoji} ${snooze}${rule}`)
    lines.push('')
    if (a.message) lines.push(`- **Message:** ${a.message}`)
    if (a.level) lines.push(`- **Level:** ${a.level}`)
    const fs = formatTs(a.firstSeen ?? a.ts)
    const ls = formatTs(a.lastSeen ?? a.ts)
    if (fs) lines.push(`- **First seen:** ${fs}`)
    if (ls) lines.push(`- **Last seen:** ${ls}`)
    if (snoozeSet.has(a.id)) lines.push(`- **Snoozed:** yes`)
    lines.push('', '---', '')
  }

  return { filename, content: lines.join('\n') + '\n' }
}
