/**
 * Format raw cron lastError for inline display.
 * - Trims whitespace
 * - Collapses newlines into single spaces (log/trace → one line)
 * - Collapses repeated spaces to one
 * - Truncates to maxLen with trailing ellipsis when too long
 */
export function formatCronError(raw: string | null | undefined, maxLen = 80): string {
  if (!raw) return ''
  const oneLine = raw.replace(/\s+/g, ' ').trim()
  if (oneLine.length <= maxLen) return oneLine
  return oneLine.slice(0, maxLen - 1).trimEnd() + '…'
}
