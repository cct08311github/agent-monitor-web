/**
 * Utilities for formatting tab badge counts.
 *
 * Rules:
 *  - 0 (or invalid) → empty string / hidden
 *  - 1–9            → exact number as string
 *  - 10+            → '9+'
 */

/**
 * Formats a badge count for display.
 * Returns an empty string when the badge should not be shown.
 */
export function formatBadge(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return ''
  if (n >= 10) return '9+'
  return String(Math.floor(n))
}

/**
 * Returns true when the badge should be rendered (count > 0 and valid).
 */
export function shouldShowBadge(n: number): boolean {
  return Number.isFinite(n) && n > 0
}
