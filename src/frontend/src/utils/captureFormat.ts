// ---------------------------------------------------------------------------
// captureFormat — formats a Capture as human-readable text for clipboard copy.
//
// Output format:
//   [YYYY-MM-DD HH:mm · Context]
//   <body>
//   #tag1 #tag2          ← only present when the body contains hashtags
// ---------------------------------------------------------------------------

import type { Capture } from './quickCapture'
import { extractTags } from './quickCaptureTags'

const pad = (n: number): string => String(n).padStart(2, '0')

/**
 * Format a unix-ms timestamp as "YYYY-MM-DD HH:mm".
 */
function formatTimestamp(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * Convert a Capture to a formatted text string suitable for sharing via
 * clipboard (Slack, email, GitHub issue, etc.).
 *
 * Example output:
 *   [2026-04-26 15:30 · LogsTab]
 *   TODO: 監控 5xx error rate 變化
 *   #observability #followup
 */
export function formatCaptureForClipboard(capture: Capture): string {
  const meta = `[${formatTimestamp(capture.createdAt)} · ${capture.context}]`
  const tags = extractTags(capture.body)
  const tagLine = tags.length ? `\n${tags.map((t) => '#' + t).join(' ')}` : ''
  return `${meta}\n${capture.body}${tagLine}`
}
