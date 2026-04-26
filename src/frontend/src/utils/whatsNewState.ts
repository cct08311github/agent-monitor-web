// ---------------------------------------------------------------------------
// whatsNewState.ts — localStorage-backed version tracking for What's New popup
// ---------------------------------------------------------------------------

const KEY = 'oc_whats_new_seen_version'

export function getLastSeenVersion(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function setLastSeenVersion(v: string): void {
  try {
    localStorage.setItem(KEY, v)
  } catch {
    // Silent — storage unavailable (private browsing, quota exceeded, etc.)
  }
}

/**
 * Returns true when `latest` is strictly newer than `lastSeen`.
 *
 * Both strings are expected to be in 'YYYY.MM.DD' format.
 * Segments are compared numerically left-to-right.
 * Returns `false` for malformed input (defensive).
 */
export function hasNewerVersion(latest: string, lastSeen: string | null): boolean {
  if (!lastSeen) return true

  const a = latest.split('.').map((n) => parseInt(n, 10))
  const b = lastSeen.split('.').map((n) => parseInt(n, 10))

  const len = Math.max(a.length, b.length)
  for (let i = 0; i < len; i++) {
    const ai = a[i] ?? 0
    const bi = b[i] ?? 0
    // Defensive: bail out on NaN (bad format)
    if (Number.isNaN(ai) || Number.isNaN(bi)) return false
    if (ai > bi) return true
    if (ai < bi) return false
  }

  return false
}
