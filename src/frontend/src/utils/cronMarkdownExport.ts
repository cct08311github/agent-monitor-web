// ---------------------------------------------------------------------------
// cronMarkdownExport.ts — Markdown export for cron jobs.
//
// Mirrors logsMarkdownExport.ts (#675) pattern for cron.
// Pure utility (no DOM, no localStorage) — easy to unit test.
//
// Features:
//   - Header with export time + job summary (total / pinned / archived)
//   - Per-job section: alias-aware name, id, schedule, enabled status, tags, description
//   - Pinned jobs show 📌 prefix
//   - Archived jobs show strikethrough (~~name~~)
//
// Filename: cron-jobs-YYYY-MM-DD.md
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface CronMdJob {
  id: string
  name?: string | null
  schedule?: { expr?: string } | null
  description?: string | null
  enabled?: boolean
}

export interface CronMdInput {
  jobs: ReadonlyArray<CronMdJob>
  aliases: ReadonlyMap<string, string>
  tagsMap: ReadonlyMap<string, ReadonlyArray<string>>
  pinned: ReadonlyArray<string>
  archived: ReadonlyArray<string>
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, '0')

function dateOnly(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function formatTs(ts: number): string {
  const d = new Date(ts)
  return `${dateOnly(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

/**
 * Builds the filename and Markdown content for a cron jobs export.
 *
 * - Generates a header with export time and job counts (total / pinned / archived).
 * - Each job is an H2 section with id, schedule, enabled status, tags, and description.
 * - Pinned jobs are prefixed with 📌.
 * - Archived jobs use strikethrough on the heading name.
 * - Empty jobs list renders a "_無 jobs_" placeholder.
 *
 * `now` is injectable so tests do not need to mock `Date`.
 */
export function buildCronMarkdown(
  input: CronMdInput,
  now: Date = new Date(),
): { filename: string; content: string } {
  const filename = `cron-jobs-${dateOnly(now)}.md`
  const total = input.jobs.length
  const pinSet = new Set(input.pinned)
  const archSet = new Set(input.archived)

  const lines: string[] = [
    `# Cron Jobs Export`,
    '',
    `**匯出時間:** ${formatTs(now.getTime())}`,
    `**總數:** ${total} jobs (${input.pinned.length} 釘選, ${input.archived.length} 已封存)`,
    '',
    '---',
    '',
  ]

  if (!total) {
    lines.push('_無 jobs_')
    return { filename, content: lines.join('\n') + '\n' }
  }

  for (const j of input.jobs) {
    const alias = input.aliases.get(j.id)
    const displayName = alias || j.name || j.id
    const expr = j.schedule?.expr ?? ''
    const enabledMark = j.enabled === true ? '✅' : '⛔'
    const pinPrefix = pinSet.has(j.id) ? '📌 ' : ''
    const archMark = archSet.has(j.id)
    const tags = input.tagsMap.get(j.id) ?? []
    const tagStr = tags.length ? ` ${tags.map((t) => `\`#${t}\``).join(' ')}` : ''

    const heading = archMark
      ? `## ${pinPrefix}~~${displayName}~~`
      : `## ${pinPrefix}${displayName}`

    lines.push(heading, '')
    lines.push(`- **ID:** \`${j.id}\``)
    if (alias) lines.push(`- **別名:** ${alias}`)
    if (expr) lines.push(`- **Schedule:** \`${expr}\``)
    lines.push(`- **Status:** ${enabledMark} ${j.enabled === true ? 'Enabled' : 'Disabled'}`)
    if (tagStr) lines.push(`- **Tags:**${tagStr}`)
    if (j.description) {
      lines.push('', j.description)
    }
    lines.push('', '---', '')
  }

  return { filename, content: lines.join('\n') + '\n' }
}
