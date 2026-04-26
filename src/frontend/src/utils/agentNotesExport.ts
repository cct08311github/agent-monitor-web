// ---------------------------------------------------------------------------
// agentNotesExport.ts — builds a Markdown export of a single agent note.
// Pure utility (no DOM, no localStorage) — easy to unit test.
// ---------------------------------------------------------------------------

export interface AgentNotesExportInput {
  agentId: string
  alias?: string | null
  note: { text: string; updatedAt: number }
}

export interface AgentNotesExportOutput {
  filename: string
  content: string
}

// Characters not allowed in filenames on Windows/macOS/Linux
const FORBIDDEN_CHARS = /[/\\:*?"<>|]/g

/**
 * Returns a filesystem-safe slug.
 * - Replaces forbidden chars with '-'
 * - Collapses whitespace runs to single '-'
 * - Collapses consecutive '-' runs
 * - Trims leading/trailing '-'
 * - Preserves Unicode (incl. CJK) — no transliteration
 */
export function slugify(s: string): string {
  return s
    .replace(FORBIDDEN_CHARS, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Formats an epoch-ms timestamp as 'YYYY-MM-DD HH:mm' in local time.
 */
export function formatTimestamp(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatDateOnly(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * Builds the filename and Markdown content for the export.
 *
 * @param input - agent id, optional alias, and note data
 * @param now   - override current date (defaults to new Date()); injectable for tests
 */
export function buildExport(
  input: AgentNotesExportInput,
  now: Date = new Date(),
): AgentNotesExportOutput {
  const aliasTrimmed = (input.alias ?? '').trim()
  const labelForFilename = aliasTrimmed || input.agentId
  const filename = `agent-notes-${slugify(labelForFilename)}-${formatDateOnly(now)}.md`

  const headerTitle = aliasTrimmed
    ? `Agent Notes — ${aliasTrimmed}`
    : `Agent Notes — ${input.agentId}`

  const aliasLine = aliasTrimmed ? `**別名:** ${aliasTrimmed}\n` : ''

  const content = [
    `# ${headerTitle}\n`,
    `\n`,
    `**Agent ID:** \`${input.agentId}\`\n`,
    aliasLine,
    `**最後儲存:** ${formatTimestamp(input.note.updatedAt)}\n`,
    `\n`,
    `---\n`,
    `\n`,
    input.note.text,
    input.note.text.endsWith('\n') ? '' : '\n',
  ].join('')

  return { filename, content }
}
