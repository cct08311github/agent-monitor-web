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
 * Format a relative human-readable time string from an epoch ms timestamp.
 * Returns strings like "just now", "45s ago", "3m ago", "2h ago", "1d ago".
 * Handles edge cases: NaN → "just now", future timestamps → "just now",
 * negative diff clamped to 0.
 *
 * @param ts  - epoch milliseconds of the event
 * @param now - reference point (defaults to Date.now()); injectable for tests
 */
export function formatRelativeTime(ts: number, now: number = Date.now()): string {
  // Guard: NaN input
  if (Number.isNaN(ts) || Number.isNaN(now)) return 'just now'
  const diff = Math.max(0, now - ts)
  const sec = Math.floor(diff / 1000)
  if (sec < 30) return 'just now'
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  return `${day}d ago`
}

/**
 * Format a future epoch ms timestamp as a human-readable countdown string.
 *
 * Rules:
 *  - invalid / non-positive target  → '未排程'
 *  - diff ≤ 30 000 ms (≤30 s)       → '即將執行'
 *  - diff > 30 000 ms               → '秒後' / '分 秒後' / '小時 分後'
 *  - overdue by > 60 000 ms         → '逾期 N 分鐘'
 *  - overdue by ≤ 60 000 ms         → '即將執行'  (grace window)
 *
 * @param targetMs - epoch milliseconds of the scheduled run
 * @param now      - reference point (defaults to Date.now()); injectable for tests
 */
export function formatCountdown(targetMs: number, now: number = Date.now()): string {
  if (!Number.isFinite(targetMs) || targetMs <= 0) return '未排程'
  const diff = targetMs - now
  if (diff <= -60000) {
    const overdueMin = Math.floor(-diff / 60000)
    return `逾期 ${overdueMin} 分鐘`
  }
  if (diff <= 30000) return '即將執行'
  const sec = Math.floor(diff / 1000)
  const min = Math.floor(sec / 60)
  const hr = Math.floor(min / 60)
  if (hr > 0) return `${hr} 小時 ${min % 60} 分後`
  if (min > 0) return `${min} 分 ${sec % 60} 秒後`
  return `${sec} 秒後`
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
