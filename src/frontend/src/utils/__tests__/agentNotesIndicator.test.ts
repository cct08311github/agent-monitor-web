import { describe, it, expect, beforeEach, vi } from 'vitest'
import { hasAgentNotes, agentNotesLength } from '../agentNotesIndicator'

function makeLocalStorageStub(seed: Record<string, string> = {}) {
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

function noteEntry(text: string, updatedAt = 1_000_000): string {
  return JSON.stringify({ text, updatedAt })
}

describe('agentNotesIndicator', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeLocalStorageStub())
  })

  describe('hasAgentNotes', () => {
    it('returns false when no note is stored', () => {
      expect(hasAgentNotes('agent-x')).toBe(false)
    })

    it('returns false when note exists but text is empty string', () => {
      vi.stubGlobal(
        'localStorage',
        makeLocalStorageStub({ 'oc_agent_notes:agent-x': noteEntry('') }),
      )
      expect(hasAgentNotes('agent-x')).toBe(false)
    })

    it('returns false when note exists but text is whitespace only', () => {
      vi.stubGlobal(
        'localStorage',
        makeLocalStorageStub({ 'oc_agent_notes:agent-x': noteEntry('   \n\t  ') }),
      )
      expect(hasAgentNotes('agent-x')).toBe(false)
    })

    it('returns true when note has non-empty text', () => {
      vi.stubGlobal(
        'localStorage',
        makeLocalStorageStub({
          'oc_agent_notes:agent-x': noteEntry('This is a note about the agent'),
        }),
      )
      expect(hasAgentNotes('agent-x')).toBe(true)
    })

    it('returns true when note text has leading/trailing whitespace but is non-empty', () => {
      vi.stubGlobal(
        'localStorage',
        makeLocalStorageStub({ 'oc_agent_notes:agent-x': noteEntry('  hello  ') }),
      )
      expect(hasAgentNotes('agent-x')).toBe(true)
    })

    it('returns false for a different agent id even when another has notes', () => {
      vi.stubGlobal(
        'localStorage',
        makeLocalStorageStub({ 'oc_agent_notes:agent-a': noteEntry('notes here') }),
      )
      expect(hasAgentNotes('agent-b')).toBe(false)
    })
  })

  describe('agentNotesLength', () => {
    it('returns 0 when no note is stored', () => {
      expect(agentNotesLength('agent-x')).toBe(0)
    })

    it('returns 0 when note text is empty string', () => {
      vi.stubGlobal(
        'localStorage',
        makeLocalStorageStub({ 'oc_agent_notes:agent-x': noteEntry('') }),
      )
      expect(agentNotesLength('agent-x')).toBe(0)
    })

    it('returns 0 when note text is whitespace only', () => {
      vi.stubGlobal(
        'localStorage',
        makeLocalStorageStub({ 'oc_agent_notes:agent-x': noteEntry('   ') }),
      )
      expect(agentNotesLength('agent-x')).toBe(0)
    })

    it('returns trimmed character count for a non-empty note', () => {
      vi.stubGlobal(
        'localStorage',
        makeLocalStorageStub({ 'oc_agent_notes:agent-x': noteEntry('hello') }),
      )
      expect(agentNotesLength('agent-x')).toBe(5)
    })

    it('trims leading and trailing whitespace before counting', () => {
      vi.stubGlobal(
        'localStorage',
        makeLocalStorageStub({ 'oc_agent_notes:agent-x': noteEntry('  hello  ') }),
      )
      expect(agentNotesLength('agent-x')).toBe(5)
    })

    it('counts multi-line content correctly', () => {
      const text = 'line1\nline2'
      vi.stubGlobal(
        'localStorage',
        makeLocalStorageStub({ 'oc_agent_notes:agent-x': noteEntry(text) }),
      )
      expect(agentNotesLength('agent-x')).toBe(text.trim().length)
    })
  })
})
