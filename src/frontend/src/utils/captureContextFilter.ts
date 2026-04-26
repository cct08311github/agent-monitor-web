// ---------------------------------------------------------------------------
// captureContextFilter.ts — utilities for context-based capture filtering.
// ---------------------------------------------------------------------------

import type { Capture } from './quickCapture'

/**
 * Returns a sorted list of unique, non-empty context values found in captures.
 */
export function uniqueContexts(captures: ReadonlyArray<Capture>): string[] {
  const set = new Set<string>()
  for (const c of captures) {
    if (c.context && c.context.trim()) set.add(c.context)
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b))
}

/**
 * Filters captures by context.
 * When context is null, returns all captures (no filter applied).
 */
export function filterByContext(
  captures: ReadonlyArray<Capture>,
  context: string | null,
): Capture[] {
  if (!context) return [...captures]
  return captures.filter((c) => c.context === context)
}
