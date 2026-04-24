/**
 * Format epoch ms → HH:mm:ss for log line prefix.
 * Uses browser local timezone via `toLocaleTimeString('en-GB')`.
 * Returns '--:--:--' for invalid timestamps (NaN guard).
 */
export function formatTs(ts: number): string {
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return '--:--:--'
  return d.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

/**
 * Format a Date into YYYYMMDD-HHMMSS (local timezone).
 * Used as a safe filename timestamp component — only [A-Za-z0-9-] chars.
 */
export function formatExportTimestamp(d: Date): string {
  const pad = (n: number, len = 2) => String(n).padStart(len, '0')
  const year = d.getFullYear()
  const month = pad(d.getMonth() + 1)
  const day = pad(d.getDate())
  const hours = pad(d.getHours())
  const minutes = pad(d.getMinutes())
  const seconds = pad(d.getSeconds())
  return `${year}${month}${day}-${hours}${minutes}${seconds}`
}
