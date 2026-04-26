// ---------------------------------------------------------------------------
// quickCaptureExport.ts — builds a Markdown export of all quick captures,
// grouped by #hashtag.  Pure utility (no DOM, no localStorage) — easy to unit test.
// ---------------------------------------------------------------------------

import type { Capture } from './quickCapture'
import { extractTags } from './quickCaptureTags'

export interface QuickCaptureExportOutput {
  filename: string
  content: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, '0')

function dateOnly(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts)
  return `${dateOnly(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatCaptureLine(c: Capture): string {
  const meta = `[${formatTimestamp(c.createdAt)} · ${c.context}]`
  // Indent continuation lines of a multi-line body so markdown renders correctly
  const body = c.body.replace(/\n/g, '\n  ')
  return `- **${meta}**\n  ${body}\n\n`
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Builds a filename and Markdown content for a bulk export of all captures.
 *
 * @param captures - ordered array of Capture objects (readonly)
 * @param now      - override current date (defaults to new Date()); injectable for tests
 */
export function buildExport(
  captures: ReadonlyArray<Capture>,
  now: Date = new Date(),
): QuickCaptureExportOutput {
  const filename = `quick-captures-${dateOnly(now)}.md`

  if (!captures.length) {
    return {
      filename,
      content: `# Quick Captures (匯出於 ${formatTimestamp(now.getTime())})\n\n_尚無 captures_\n`,
    }
  }

  // Group by tag; a capture with multiple tags appears in each tag's section.
  const tagBuckets = new Map<string, Capture[]>()
  const untagged: Capture[] = []

  for (const c of captures) {
    const tags = extractTags(c.body)
    if (tags.length === 0) {
      untagged.push(c)
    } else {
      for (const tag of tags) {
        const arr = tagBuckets.get(tag) ?? []
        arr.push(c)
        tagBuckets.set(tag, arr)
      }
    }
  }

  // Sort tags: count desc, ties broken alphabetically
  const sortedTags = Array.from(tagBuckets.entries()).sort(
    (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]),
  )

  const totalTags = tagBuckets.size

  const lines: string[] = []
  lines.push(`# Quick Captures (匯出於 ${formatTimestamp(now.getTime())})\n`)
  lines.push(`\n共 ${captures.length} 筆 captures，含 ${totalTags} 個 tags。\n`)

  for (const [tag, items] of sortedTags) {
    lines.push(`\n## #${tag} (${items.length})\n\n`)
    for (const c of items) {
      lines.push(formatCaptureLine(c))
    }
  }

  if (untagged.length) {
    lines.push(`\n## 無 tag (${untagged.length})\n\n`)
    for (const c of untagged) {
      lines.push(formatCaptureLine(c))
    }
  }

  return { filename, content: lines.join('') }
}
