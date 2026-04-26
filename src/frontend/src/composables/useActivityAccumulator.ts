/**
 * useActivityAccumulator.ts
 *
 * localStorage-backed accumulator that records daily session activity counts
 * and provides the data for the ActivityHeatmap component.
 *
 * Storage shape: { [YYYY-MM-DD]: number }
 * Entries older than 90 days are pruned on load.
 *
 * Design: accepts an injectable Storage for testability.
 */

import { dateKey } from '@/utils/activityHeatmap'

const STORAGE_KEY = 'oc_activity_heatmap'
const TTL_DAYS = 90

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseCounts(raw: string | null): Record<string, number> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, number>
    }
    return {}
  } catch {
    return {}
  }
}

function pruneOld(counts: Record<string, number>, today: Date): Record<string, number> {
  const cutoff = new Date(today)
  cutoff.setDate(today.getDate() - TTL_DAYS)
  const cutoffKey = dateKey(cutoff)

  const pruned: Record<string, number> = {}
  for (const [k, v] of Object.entries(counts)) {
    if (k >= cutoffKey) {
      pruned[k] = v
    }
  }
  return pruned
}

// ---------------------------------------------------------------------------
// useActivityAccumulator
// ---------------------------------------------------------------------------

export function useActivityAccumulator(storage: Storage = localStorage) {
  /**
   * Increment the count for the day containing `when` (epoch ms, default now).
   */
  function increment(when: number = Date.now()): void {
    const d = new Date(when)
    const k = dateKey(d)
    const raw = storage.getItem(STORAGE_KEY)
    const counts = parseCounts(raw)
    counts[k] = (counts[k] ?? 0) + 1
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(counts))
    } catch {
      // Ignore storage quota / private-browsing errors
    }
  }

  /**
   * Load the accumulated counts, pruning entries older than TTL_DAYS.
   * Returns a Map<YYYY-MM-DD, count>.
   */
  function load(): Map<string, number> {
    const raw = storage.getItem(STORAGE_KEY)
    const counts = pruneOld(parseCounts(raw), new Date())

    // Persist pruned version back (best-effort)
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(counts))
    } catch {
      // Ignore
    }

    return new Map(Object.entries(counts))
  }

  /**
   * Clear all accumulated data by removing the storage entry.
   * Idempotent — safe to call multiple times.
   */
  function reset(): void {
    try {
      storage.removeItem(STORAGE_KEY)
    } catch {
      // Ignore storage errors (private-browsing, quota, etc.)
    }
  }

  return { increment, load, reset }
}
