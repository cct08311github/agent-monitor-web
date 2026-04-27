// ---------------------------------------------------------------------------
// alertsJsonExport.ts — round-trippable JSON backup for alerts.
//
// Persists full state: alerts + snoozedIds + snooze metadata.
// Designed for device migration and general-purpose backup.
//
// Mirrors cronJsonExport.ts (#673) and completes the JSON export
// parity for observability surfaces (5/5).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface AlertsBackup {
  version: '1'
  exportedAt: number
  alerts: unknown[]
  snoozedIds: string[]
  snoozes: Record<string, unknown>
}

export interface AlertsJsonInput {
  alerts: ReadonlyArray<unknown>
  snoozedIds: ReadonlyArray<string>
  snoozes: ReadonlyMap<string, unknown> | Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, '0')

function dateOnly(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function timestampSlug(d: Date): string {
  return `${dateOnly(d)}-${pad(d.getHours())}${pad(d.getMinutes())}`
}

function mapToObj(
  m: ReadonlyMap<string, unknown> | Record<string, unknown>,
): Record<string, unknown> {
  if (m instanceof Map) {
    const out: Record<string, unknown> = {}
    for (const [k, v] of m) out[k] = v
    return out
  }
  return { ...m }
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

/**
 * Builds a versioned AlertsBackup from the supplied state and returns
 * a filename + JSON string ready for download.
 *
 * `now` is injectable so tests do not need to mock Date.
 */
export function buildAlertsJson(
  input: AlertsJsonInput,
  now: Date = new Date(),
): { filename: string; content: string } {
  const payload: AlertsBackup = {
    version: '1',
    exportedAt: now.getTime(),
    alerts: [...input.alerts],
    snoozedIds: [...input.snoozedIds],
    snoozes: mapToObj(input.snoozes),
  }

  return {
    filename: `alerts-${timestampSlug(now)}.json`,
    content: JSON.stringify(payload, null, 2),
  }
}
