// ---------------------------------------------------------------------------
// sessionsMarkdownExport.ts — builds a Markdown export of agent sessions.
//
// Mirrors the agentNotesExport.ts pattern (#503) for sessions.
// Pure utility (no DOM, no localStorage) — easy to unit test.
//
// Filename: sessions-{agentId}-YYYY-MM-DD.md
// ---------------------------------------------------------------------------

export interface SessionForMd {
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

function formatTimestamp(ts: number | string | null | undefined): string {
  if (ts == null) return ''
  const t = typeof ts === 'number' ? ts : Date.parse(ts)
  if (!Number.isFinite(t)) return ''
  const d = new Date(t)
  return `${dateOnly(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

/**
 * Builds the filename and Markdown content for a sessions export.
 *
 * - Generates an agent header with id, optional alias, export time, and count.
 * - Each session becomes its own `##` section.
 * - Bookmarked sessions are prefixed with ⭐.
 * - preview falls back to firstMessage when preview is absent.
 *
 * `now` is injectable so tests do not need to mock `Date`.
 */
export function buildSessionsMarkdown(
  agentId: string,
  agentName: string,
  sessions: ReadonlyArray<SessionForMd>,
  bookmarkedIds: ReadonlyArray<string>,
  now: Date = new Date(),
): { filename: string; content: string } {
  const filename = `sessions-${agentId || 'unknown'}-${dateOnly(now)}.md`
  const bookSet = new Set(bookmarkedIds)
  const headerName = agentName || agentId || 'Unknown Agent'

  const lines: string[] = [
    `# Sessions — ${headerName}`,
    '',
    `**Agent ID:** \`${agentId}\``,
  ]

  if (agentName && agentName !== agentId) {
    lines.push(`**別名:** ${agentName}`)
  }

  lines.push(`**匯出時間:** ${formatTimestamp(now.getTime())}`)
  lines.push(`**Sessions count:** ${sessions.length}`)
  lines.push('', '---', '')

  if (!sessions.length) {
    lines.push('_尚無 sessions_')
  } else {
    for (const s of sessions) {
      const star = bookSet.has(s.id) ? '⭐ ' : ''
      const ts = formatTimestamp(s.createdAt)
      const title = s.title ?? s.id
      lines.push(`## ${star}${title}`)
      lines.push('')
      if (ts) lines.push(`**時間:** ${ts}`)
      lines.push(`**ID:** \`${s.id}\``)
      lines.push('')
      const preview = s.preview ?? s.firstMessage ?? ''
      if (preview) lines.push(preview)
      lines.push('', '---', '')
    }
  }

  return { filename, content: lines.join('\n') + '\n' }
}
