import { describe, it, expect } from 'vitest'
import { slugify, formatTimestamp, buildExport } from '../agentNotesExport'
import type { AgentNotesExportInput } from '../agentNotesExport'

// ---------------------------------------------------------------------------
// slugify
// ---------------------------------------------------------------------------

describe('slugify', () => {
  it('replaces spaces with hyphens', () => {
    expect(slugify('Hello World')).toBe('Hello-World')
  })

  it('preserves CJK characters', () => {
    expect(slugify('客服機器人')).toBe('客服機器人')
  })

  it('replaces all forbidden filesystem chars with hyphens and collapses runs', () => {
    // / \\ : * ? " < > |
    expect(slugify('a/b\\c:d*e?f"g<h>i|j')).toBe('a-b-c-d-e-f-g-h-i-j')
  })

  it('collapses multiple consecutive forbidden chars / spaces into one hyphen', () => {
    expect(slugify('a//b  c')).toBe('a-b-c')
  })

  it('trims leading and trailing hyphens', () => {
    expect(slugify('/leading')).toBe('leading')
    expect(slugify('trailing/')).toBe('trailing')
    expect(slugify('/both/')).toBe('both')
  })

  it('handles empty string', () => {
    expect(slugify('')).toBe('')
  })
})

// ---------------------------------------------------------------------------
// formatTimestamp
// ---------------------------------------------------------------------------

describe('formatTimestamp', () => {
  it('formats to YYYY-MM-DD HH:mm in local time', () => {
    // Construct a specific local time to avoid timezone-sensitive Date.parse
    const d = new Date(2026, 3, 26, 13, 42) // month is 0-indexed: 3 = April
    expect(formatTimestamp(d.getTime())).toBe('2026-04-26 13:42')
  })

  it('zero-pads month, day, hour, minute', () => {
    const d = new Date(2026, 0, 5, 8, 3) // Jan 5, 08:03
    expect(formatTimestamp(d.getTime())).toBe('2026-01-05 08:03')
  })
})

// ---------------------------------------------------------------------------
// buildExport
// ---------------------------------------------------------------------------

const NOW = new Date(2026, 3, 26) // 2026-04-26

function makeInput(overrides: Partial<AgentNotesExportInput> = {}): AgentNotesExportInput {
  return {
    agentId: 'b3f9-claude-prod-1',
    alias: null,
    note: { text: 'My notes here.', updatedAt: new Date(2026, 3, 26, 13, 42).getTime() },
    ...overrides,
  }
}

describe('buildExport – filename', () => {
  it('uses alias slug in filename when alias is set', () => {
    const { filename } = buildExport(makeInput({ alias: 'API主機' }), NOW)
    expect(filename).toContain('API主機')
    expect(filename).toContain('2026-04-26')
    expect(filename).toMatch(/^agent-notes-.*\.md$/)
  })

  it('falls back to agentId in filename when alias is null', () => {
    const { filename } = buildExport(makeInput({ alias: null }), NOW)
    expect(filename).toContain('b3f9-claude-prod-1')
    expect(filename).toContain('2026-04-26')
  })

  it('falls back to agentId when alias is empty string', () => {
    const { filename } = buildExport(makeInput({ alias: '' }), NOW)
    expect(filename).toContain('b3f9-claude-prod-1')
  })

  it('falls back to agentId when alias is whitespace-only', () => {
    const { filename } = buildExport(makeInput({ alias: '   ' }), NOW)
    expect(filename).toContain('b3f9-claude-prod-1')
  })
})

describe('buildExport – content with alias', () => {
  it('includes Agent ID, 別名, 最後儲存, and separator', () => {
    const { content } = buildExport(makeInput({ alias: 'API主機' }), NOW)
    expect(content).toContain('**Agent ID:** `b3f9-claude-prod-1`')
    expect(content).toContain('**別名:** API主機')
    expect(content).toContain('**最後儲存:**')
    expect(content).toContain('---')
  })

  it('includes the user body text verbatim (not escaped)', () => {
    const md = '## Section\n\n- item **bold** _italic_\n'
    const { content } = buildExport(makeInput({ alias: 'x', note: { text: md, updatedAt: 0 } }), NOW)
    expect(content).toContain(md)
  })

  it('header title contains alias', () => {
    const { content } = buildExport(makeInput({ alias: 'My Agent' }), NOW)
    expect(content).toMatch(/^# Agent Notes — My Agent/)
  })
})

describe('buildExport – content without alias', () => {
  it('omits the 別名 line when alias is null', () => {
    const { content } = buildExport(makeInput({ alias: null }), NOW)
    expect(content).not.toContain('**別名:**')
  })

  it('omits the 別名 line when alias is empty', () => {
    const { content } = buildExport(makeInput({ alias: '' }), NOW)
    expect(content).not.toContain('**別名:**')
  })

  it('header title contains agentId when no alias', () => {
    const { content } = buildExport(makeInput({ alias: null }), NOW)
    expect(content).toMatch(/^# Agent Notes — b3f9-claude-prod-1/)
  })
})

describe('buildExport – trailing newline', () => {
  it('content ends with newline when body already ends with \\n', () => {
    const { content } = buildExport(
      makeInput({ note: { text: 'ends with newline\n', updatedAt: 0 } }),
      NOW,
    )
    expect(content.endsWith('\n')).toBe(true)
    // Should not double-append
    expect(content.endsWith('\n\n')).toBe(false)
  })

  it('content ends with newline when body does NOT end with \\n', () => {
    const { content } = buildExport(
      makeInput({ note: { text: 'no trailing newline', updatedAt: 0 } }),
      NOW,
    )
    expect(content.endsWith('\n')).toBe(true)
  })
})
