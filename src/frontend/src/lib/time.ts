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
