// ---------------------------------------------------------------------------
// agentNotes.ts — per-agent scratchpad notes, persisted to localStorage.
// Same design language as sessionBookmarks (oc_*:<agentId> prefix pattern).
// ---------------------------------------------------------------------------

const KEY_PREFIX = 'oc_agent_notes:'

function key(agentId: string): string {
  return `${KEY_PREFIX}${agentId}`
}

export interface AgentNote {
  text: string
  updatedAt: number
}

/**
 * Load the note for the given agent.
 * Returns null if nothing is stored or the stored value is invalid.
 */
export function loadNote(agentId: string): AgentNote | null {
  try {
    const raw = localStorage.getItem(key(agentId))
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as Record<string, unknown>).text !== 'string' ||
      typeof (parsed as Record<string, unknown>).updatedAt !== 'number'
    ) {
      return null
    }
    return parsed as AgentNote
  } catch {
    return null
  }
}

/**
 * Save a note for the given agent.
 *
 * @param agentId - The agent identifier
 * @param text    - The note text (empty string is valid)
 * @param now     - Timestamp in epoch ms (defaults to Date.now()); injectable for tests
 */
export function saveNote(agentId: string, text: string, now: number = Date.now()): AgentNote {
  const note: AgentNote = { text, updatedAt: now }
  try {
    localStorage.setItem(key(agentId), JSON.stringify(note))
  } catch {
    /* silent — storage quota errors should not surface as UI errors */
  }
  return note
}

/**
 * Remove the note for the given agent.
 */
export function clearNote(agentId: string): void {
  try {
    localStorage.removeItem(key(agentId))
  } catch {
    /* silent */
  }
}
