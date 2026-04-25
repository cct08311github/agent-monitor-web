// ---------------------------------------------------------------------------
// relativeTime.ts — Chinese relative-time formatter for UI tooltips
//
// Used by ConnectionStatus to render "上次心跳: 3s 前" style strings.
// For English relative time see lib/time.ts#formatRelativeTime.
// ---------------------------------------------------------------------------

/**
 * Return a Chinese relative-time string from a past timestamp.
 *
 * Thresholds:
 *   < 5s   → '剛剛'
 *   < 60s  → '${s}s 前'
 *   < 60m  → '${m}m 前'
 *   ≥ 60m  → '${h}h 前'
 *
 * @param then - epoch ms of the event
 * @param now  - reference point in epoch ms (defaults to Date.now()); injectable for tests
 */
export function relativeTimeFromNow(then: number, now: number = Date.now()): string {
  const diffMs = Math.max(0, now - then)
  const sec = Math.floor(diffMs / 1000)
  if (sec < 5) return '剛剛'
  if (sec < 60) return `${sec}s 前`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m 前`
  const hr = Math.floor(min / 60)
  return `${hr}h 前`
}
