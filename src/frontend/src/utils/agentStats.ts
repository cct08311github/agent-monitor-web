// ---------------------------------------------------------------------------
// agentStats.ts — derived per-agent metrics from bookmarks, captures, notes.
// Pure functions, no Vue reactivity — compose with computed() in components.
// ---------------------------------------------------------------------------

import type { Capture } from './quickCapture'

export interface AgentStats {
  bookmarks: number
  captures: number
  pinnedCaptures: number
  notesChars: number
}

export interface AgentStatsInput {
  agentId: string
  displayName: string
  bookmarks: ReadonlyArray<string>
  captures: ReadonlyArray<Capture>
  pinnedIds: ReadonlyArray<string>
  notesText: string
}

/**
 * Returns true if the capture's context string references the given agent,
 * either by agentId substring or by displayName substring.
 */
export function captureMatchesAgent(
  capture: Capture,
  agentId: string,
  displayName: string,
): boolean {
  const ctx = capture.context
  if (agentId && ctx.includes(agentId)) return true
  if (displayName && ctx.includes(displayName)) return true
  return false
}

/**
 * Compute all 4 derived stats for one agent.
 */
export function computeAgentStats(input: AgentStatsInput): AgentStats {
  const matched = input.captures.filter((c) =>
    captureMatchesAgent(c, input.agentId, input.displayName),
  )
  const pinSet = new Set(input.pinnedIds)
  const pinnedCount = matched.filter((c) => pinSet.has(c.id)).length

  return {
    bookmarks: input.bookmarks.length,
    captures: matched.length,
    pinnedCaptures: pinnedCount,
    notesChars: input.notesText.trim().length,
  }
}
