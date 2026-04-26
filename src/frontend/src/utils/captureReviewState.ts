/**
 * captureReviewState — localStorage helpers for the weekly Capture review reminder.
 *
 * Logic:
 *  - Show only on Sunday ≥ 08:00 local time.
 *  - Don't show if the user has already dismissed it this week (same ISO-week as today).
 *  - Don't show if the user has permanently disabled it.
 */

const KEY_DISMISSED = 'oc_capture_review_last_dismissed'
const KEY_DISABLED = 'oc_capture_review_disabled'

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * Return the start of the ISO week (Sunday 00:00:00.000) for the given date.
 * JS `getDay()` returns 0 for Sunday, so we subtract `getDay()` days.
 */
function startOfWeekSunday(now: Date): Date {
  const x = new Date(now)
  x.setHours(0, 0, 0, 0)
  x.setDate(x.getDate() - x.getDay())
  return x
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function isReminderDisabled(): boolean {
  try {
    return localStorage.getItem(KEY_DISABLED) === '1'
  } catch {
    return false
  }
}

export function disableReminder(): void {
  try {
    localStorage.setItem(KEY_DISABLED, '1')
  } catch {
    /* silent */
  }
}

export function getLastDismissed(): string | null {
  try {
    return localStorage.getItem(KEY_DISMISSED)
  } catch {
    return null
  }
}

export function markDismissed(now: Date = new Date()): void {
  try {
    localStorage.setItem(KEY_DISMISSED, dateKey(now))
  } catch {
    /* silent */
  }
}

/**
 * Returns true when the weekly review banner should be shown.
 *
 * Conditions (all must hold):
 *  1. Reminder not permanently disabled.
 *  2. Today is Sunday (getDay() === 0).
 *  3. Current hour is ≥ 08:00 local.
 *  4. User has NOT dismissed the reminder during the current ISO week.
 */
export function shouldShowWeeklyReminder(now: Date = new Date()): boolean {
  if (isReminderDisabled()) return false

  // Only Sunday
  if (now.getDay() !== 0) return false

  // Only after 08:00
  if (now.getHours() < 8) return false

  const last = getLastDismissed()
  if (!last) return true

  const lastDate = new Date(`${last}T00:00:00`)
  if (Number.isNaN(lastDate.getTime())) return true

  const lastWeekStart = startOfWeekSunday(lastDate)
  const nowWeekStart = startOfWeekSunday(now)

  // Same week start means already dismissed this week → don't show
  return lastWeekStart.getTime() !== nowWeekStart.getTime()
}
