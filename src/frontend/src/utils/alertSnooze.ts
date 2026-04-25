// ---------------------------------------------------------------------------
// alertSnooze.ts — per-alert snooze state persisted to localStorage.
//
// Alert ID note: AlertRecord has no dedicated `id` field; we derive a stable
// key from `rule + ts` (e.g. "high_error_rate:1714158000000"). This key is
// unique for a given alert firing event and is used as `alertId` throughout.
// ---------------------------------------------------------------------------

const KEY = 'oc_alert_snooze'

export interface SnoozeEntry {
  alertId: string
  snoozedAt: number // epoch ms when snooze started
  snoozedUntil: number // epoch ms when it expires
  duration: number // duration in ms (for display)
}

export const SNOOZE_DURATIONS = [
  { label: '15 分鐘', ms: 15 * 60 * 1000 },
  { label: '1 小時', ms: 60 * 60 * 1000 },
  { label: '4 小時', ms: 4 * 60 * 60 * 1000 },
  { label: '24 小時', ms: 24 * 60 * 60 * 1000 },
] as const

// ---------------------------------------------------------------------------
// Type guard
// ---------------------------------------------------------------------------

function isSnoozeEntry(v: unknown): v is SnoozeEntry {
  if (!v || typeof v !== 'object') return false
  const e = v as Record<string, unknown>
  return (
    typeof e.alertId === 'string' &&
    typeof e.snoozedAt === 'number' &&
    typeof e.snoozedUntil === 'number' &&
    typeof e.duration === 'number'
  )
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

export function loadSnoozes(): Map<string, SnoozeEntry> {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return new Map()
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return new Map()
    const obj = parsed as Record<string, unknown>
    const entries: [string, SnoozeEntry][] = []
    for (const [k, v] of Object.entries(obj)) {
      if (isSnoozeEntry(v)) entries.push([k, v])
    }
    return new Map(entries)
  } catch {
    return new Map()
  }
}

export function saveSnoozes(m: Map<string, SnoozeEntry>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(m)))
  } catch {
    /* silent */
  }
}

// ---------------------------------------------------------------------------
// Core operations
// ---------------------------------------------------------------------------

export function snoozeAlert(
  alertId: string,
  durationMs: number,
  now: number = Date.now(),
): SnoozeEntry {
  const entry: SnoozeEntry = {
    alertId,
    snoozedAt: now,
    snoozedUntil: now + durationMs,
    duration: durationMs,
  }
  const m = loadSnoozes()
  m.set(alertId, entry)
  saveSnoozes(m)
  return entry
}

export function unsnoozeAlert(alertId: string): void {
  const m = loadSnoozes()
  m.delete(alertId)
  saveSnoozes(m)
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

export function isSnoozed(entry: SnoozeEntry | undefined, now: number = Date.now()): boolean {
  return entry !== undefined && entry.snoozedUntil > now
}

export function pruneExpired(
  m: Map<string, SnoozeEntry>,
  now: number = Date.now(),
): Map<string, SnoozeEntry> {
  const next = new Map<string, SnoozeEntry>()
  for (const [k, v] of m) {
    if (isSnoozed(v, now)) next.set(k, v)
  }
  return next
}

export function partitionAlerts<T extends { id: string }>(
  alerts: ReadonlyArray<T>,
  snoozes: ReadonlyMap<string, SnoozeEntry>,
  now: number = Date.now(),
): { active: T[]; snoozed: T[] } {
  const active: T[] = []
  const snoozed: T[] = []
  for (const a of alerts) {
    const entry = snoozes.get(a.id)
    if (isSnoozed(entry, now)) {
      snoozed.push(a)
    } else {
      active.push(a)
    }
  }
  return { active, snoozed }
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

/**
 * Build a display label for the remaining snooze time.
 * e.g. "47m 後自動恢復" or "2h 後自動恢復"
 */
export function snoozeRemainingLabel(entry: SnoozeEntry, now: number = Date.now()): string {
  const diffMs = Math.max(0, entry.snoozedUntil - now)
  const sec = Math.floor(diffMs / 1000)
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m 後自動恢復`
  const hr = Math.floor(min / 60)
  return `${hr}h 後自動恢復`
}

/**
 * Return the SNOOZE_DURATIONS label for a given ms value, or the ms count as fallback.
 */
export function durationLabel(durationMs: number): string {
  for (const d of SNOOZE_DURATIONS) {
    if (d.ms === durationMs) return d.label
  }
  return `${Math.floor(durationMs / 60000)}m`
}
