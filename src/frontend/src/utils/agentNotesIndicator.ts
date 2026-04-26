// ---------------------------------------------------------------------------
// agentNotesIndicator.ts — helpers to check whether an agent has a note.
// Used by AgentCard to show a 📝 icon when a non-empty note is stored.
// ---------------------------------------------------------------------------

import { loadNote } from './agentNotes'

/**
 * Returns true when the agent has a stored note with non-empty trimmed text.
 */
export function hasAgentNotes(agentId: string): boolean {
  const note = loadNote(agentId)
  return note !== null && typeof note.text === 'string' && note.text.trim().length > 0
}

/**
 * Returns the trimmed character count of the stored note, or 0 if none.
 */
export function agentNotesLength(agentId: string): number {
  const note = loadNote(agentId)
  return note?.text ? note.text.trim().length : 0
}
