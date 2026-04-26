import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  shouldShowWeeklyReminder,
  markDismissed,
  disableReminder,
  isReminderDisabled,
  getLastDismissed,
} from '../captureReviewState'

// ---------------------------------------------------------------------------
// localStorage stub (fresh for each test)
// ---------------------------------------------------------------------------

function makeLocalStorageStub(seed: Record<string, string> = {}): Storage {
  const store: Record<string, string> = { ...seed }
  return {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => {
      store[k] = String(v)
    },
    removeItem: (k: string) => {
      delete store[k]
    },
    clear: () => {
      for (const k of Object.keys(store)) delete store[k]
    },
    key: (i: number) => Object.keys(store)[i] ?? null,
    get length() {
      return Object.keys(store).length
    },
  } as Storage
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/** Build a Date for the given ISO date string + hour (local). */
function makeDate(isoDate: string, hour: number): Date {
  const d = new Date(`${isoDate}T00:00:00`)
  d.setHours(hour)
  return d
}

// Sunday 2025-04-27, Saturday 2025-04-26
const SUNDAY = '2025-04-27'
const SATURDAY = '2025-04-26'

// Previous week's Sunday (2025-04-20)
const PREV_SUNDAY = '2025-04-20'

beforeEach(() => {
  vi.stubGlobal('localStorage', makeLocalStorageStub())
})

// ---------------------------------------------------------------------------
// shouldShowWeeklyReminder — trigger conditions
// ---------------------------------------------------------------------------

describe('shouldShowWeeklyReminder', () => {
  it('returns true on Sunday ≥ 08:00 with no prior dismiss', () => {
    const now = makeDate(SUNDAY, 9)
    expect(shouldShowWeeklyReminder(now)).toBe(true)
  })

  it('returns false on Saturday (non-Sunday)', () => {
    const now = makeDate(SATURDAY, 9)
    expect(shouldShowWeeklyReminder(now)).toBe(false)
  })

  it('returns false on Sunday before 08:00 (too early)', () => {
    const now = makeDate(SUNDAY, 7)
    expect(shouldShowWeeklyReminder(now)).toBe(false)
  })

  it('returns false on Sunday at exactly 07:59 (still too early)', () => {
    const now = makeDate(SUNDAY, 7)
    now.setMinutes(59)
    expect(shouldShowWeeklyReminder(now)).toBe(false)
  })

  it('returns true on Sunday at exactly 08:00', () => {
    const now = makeDate(SUNDAY, 8)
    now.setMinutes(0)
    expect(shouldShowWeeklyReminder(now)).toBe(true)
  })

  it('returns false when reminder is permanently disabled', () => {
    vi.stubGlobal(
      'localStorage',
      makeLocalStorageStub({ oc_capture_review_disabled: '1' }),
    )
    const now = makeDate(SUNDAY, 9)
    expect(shouldShowWeeklyReminder(now)).toBe(false)
  })

  it('returns false when dismissed earlier today (same week as this Sunday)', () => {
    // Dismiss on this Sunday → last dismissed = SUNDAY → same week as now → don't show
    vi.stubGlobal(
      'localStorage',
      makeLocalStorageStub({ oc_capture_review_last_dismissed: SUNDAY }),
    )
    const now = makeDate(SUNDAY, 10)
    expect(shouldShowWeeklyReminder(now)).toBe(false)
  })

  it('returns true when dismissed last week (prev week → different week start)', () => {
    // Dismissed last Sunday — that is a different week
    vi.stubGlobal(
      'localStorage',
      makeLocalStorageStub({ oc_capture_review_last_dismissed: PREV_SUNDAY }),
    )
    const now = makeDate(SUNDAY, 9)
    expect(shouldShowWeeklyReminder(now)).toBe(true)
  })

  it('returns true when last_dismissed key is absent', () => {
    const now = makeDate(SUNDAY, 9)
    expect(shouldShowWeeklyReminder(now)).toBe(true)
  })

  it('returns true when last_dismissed has an invalid/corrupt value', () => {
    vi.stubGlobal(
      'localStorage',
      makeLocalStorageStub({ oc_capture_review_last_dismissed: 'not-a-date' }),
    )
    const now = makeDate(SUNDAY, 9)
    expect(shouldShowWeeklyReminder(now)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// markDismissed
// ---------------------------------------------------------------------------

describe('markDismissed', () => {
  it('stores today dateKey in localStorage', () => {
    const now = makeDate(SUNDAY, 9)
    markDismissed(now)
    expect(getLastDismissed()).toBe(SUNDAY)
  })

  it('defaults to today when no argument given', () => {
    markDismissed()
    const stored = getLastDismissed()
    const today = new Date()
    const expected = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    expect(stored).toBe(expected)
  })
})

// ---------------------------------------------------------------------------
// disableReminder / isReminderDisabled
// ---------------------------------------------------------------------------

describe('disableReminder', () => {
  it('sets the disabled flag so isReminderDisabled returns true', () => {
    expect(isReminderDisabled()).toBe(false)
    disableReminder()
    expect(isReminderDisabled()).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// localStorage error resilience
// ---------------------------------------------------------------------------

describe('localStorage error resilience', () => {
  it('shouldShowWeeklyReminder handles localStorage.getItem throwing', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('quota') },
      setItem: () => { throw new Error('quota') },
    })
    const now = makeDate(SUNDAY, 9)
    // Should not throw; returns true when disabled flag unreadable (false path)
    expect(() => shouldShowWeeklyReminder(now)).not.toThrow()
  })

  it('markDismissed silently ignores localStorage.setItem throwing', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => { throw new Error('quota') },
    })
    expect(() => markDismissed()).not.toThrow()
  })
})
