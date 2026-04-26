// ---------------------------------------------------------------------------
// notifySnooze.ts — ad-hoc notification snooze (global, not per-alert).
//
// Stores a single epoch-ms expiry in localStorage.  While snoozedUntil > now,
// desktop notifications, title flash, and sound effects are suppressed.
// Badge increment is intentionally NOT suppressed (visual accounting only).
//
// Usage:
//   isSnoozedNow()        — quick guard inside notification utilities
//   snoozeFor(ms)         — activate snooze and return expiry timestamp
//   clearSnooze()         — cancel snooze early
//   loadSnoozedUntil()    — read raw persisted value
//   setSnoozedUntil(ts)   — write raw value (null = remove)
// ---------------------------------------------------------------------------

const KEY = 'oc_notify_snoozed_until'

export function loadSnoozedUntil(): number | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

export function setSnoozedUntil(ts: number | null): void {
  try {
    if (ts === null) {
      localStorage.removeItem(KEY)
    } else {
      localStorage.setItem(KEY, String(ts))
    }
  } catch {
    /* silent — storage may be blocked */
  }
}

export function isSnoozedNow(now: number = Date.now()): boolean {
  const until = loadSnoozedUntil()
  return until !== null && until > now
}

/**
 * Activates snooze for `durationMs` milliseconds from `now`.
 * @returns The epoch-ms timestamp when snooze expires.
 */
export function snoozeFor(durationMs: number, now: number = Date.now()): number {
  const expiresAt = now + durationMs
  setSnoozedUntil(expiresAt)
  return expiresAt
}

export function clearSnooze(): void {
  setSnoozedUntil(null)
}

// ---------------------------------------------------------------------------
// Options exposed to the UI
// ---------------------------------------------------------------------------

export const SNOOZE_OPTIONS = [
  { label: '15 分鐘', ms: 15 * 60 * 1000 },
  { label: '1 小時', ms: 60 * 60 * 1000 },
  { label: '4 小時', ms: 4 * 60 * 60 * 1000 },
] as const

/**
 * Formats remaining ms as a human-readable string, e.g. "23m" or "2h".
 */
export function formatRemainingMs(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const min = Math.floor(totalSec / 60)
  if (min < 60) return `${min}m`
  const hr = Math.floor(min / 60)
  return `${hr}h`
}
