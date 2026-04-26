// ---------------------------------------------------------------------------
// sessionsJsonExport.ts — JSON export for agent sessions.
//
// Produces a single JSON file containing:
//   { exportedAt, agentId, sessions, bookmarkedIds }
//
// Mirrors logsJsonExport.ts; designed for offline analysis and parity with the
// Sessions CSV export (#661).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface SessionForJson {
  id: string
  createdAt?: number | string | null
  preview?: string | null
  title?: string | null
  firstMessage?: string | null
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, '0')

function dateOnly(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

/**
 * Serialises agent sessions into a JSON file payload.
 *
 * Export shape: `{ exportedAt, agentId, sessions, bookmarkedIds }`
 *
 * `now` is injectable so tests do not need to mock `Date`.
 */
export function buildSessionsJson(
  agentId: string,
  sessions: ReadonlyArray<SessionForJson>,
  bookmarkedIds: ReadonlyArray<string>,
  now: Date = new Date(),
): { filename: string; content: string } {
  const payload = {
    exportedAt: now.getTime(),
    agentId,
    sessions: [...sessions],
    bookmarkedIds: [...bookmarkedIds],
  }

  return {
    filename: `sessions-${agentId || 'unknown'}-${dateOnly(now)}.json`,
    content: JSON.stringify(payload, null, 2),
  }
}
