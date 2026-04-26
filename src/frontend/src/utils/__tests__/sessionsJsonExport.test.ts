import { describe, it, expect } from 'vitest'
import { buildSessionsJson } from '../sessionsJsonExport'
import type { SessionForJson } from '../sessionsJsonExport'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const s1: SessionForJson = {
  id: 'sess-aabbccdd-1122-3344',
  createdAt: new Date(2026, 3, 26, 10, 5, 3).getTime(),
  preview: 'Refactor authentication module',
  title: 'Auth refactor',
}

const s2: SessionForJson = {
  id: 'sess-eeff0011-5566-7788',
  createdAt: '2026-04-25T08:00:00.000Z',
  preview: null,
  firstMessage: 'Deploy to production server',
  title: null,
}

const s3: SessionForJson = {
  id: 'sess-no-preview',
  // no createdAt, no preview, no firstMessage, no title
}

// ---------------------------------------------------------------------------
// filename
// ---------------------------------------------------------------------------

describe('buildSessionsJson — filename', () => {
  it('filename matches sessions-{agentId}-YYYY-MM-DD.json', () => {
    const { filename } = buildSessionsJson('my-agent', [], [], new Date(2026, 3, 26))
    expect(filename).toMatch(/^sessions-my-agent-\d{4}-\d{2}-\d{2}\.json$/)
  })

  it('filename encodes agentId and injectable now date correctly', () => {
    const { filename } = buildSessionsJson('my-agent', [], [], new Date(2026, 3, 26))
    expect(filename).toBe('sessions-my-agent-2026-04-26.json')
  })

  it('empty agentId falls back to "unknown"', () => {
    const { filename } = buildSessionsJson('', [], [], new Date(2026, 3, 26))
    expect(filename).toBe('sessions-unknown-2026-04-26.json')
  })

  it('filename pads month and day with leading zeros', () => {
    const { filename } = buildSessionsJson('a', [], [], new Date(2024, 0, 7)) // 2024-01-07
    expect(filename).toBe('sessions-a-2024-01-07.json')
  })
})

// ---------------------------------------------------------------------------
// exportedAt
// ---------------------------------------------------------------------------

describe('buildSessionsJson — exportedAt', () => {
  it('content includes exportedAt as numeric timestamp', () => {
    const now = new Date(2026, 3, 26, 12, 0, 0)
    const { content } = buildSessionsJson('agent-1', [], [], now)
    const parsed = JSON.parse(content) as { exportedAt: number }
    expect(parsed.exportedAt).toBe(now.getTime())
  })

  it('exportedAt is a number', () => {
    const { content } = buildSessionsJson('agent-1', [], [], new Date(2026, 3, 26))
    const parsed = JSON.parse(content) as { exportedAt: unknown }
    expect(typeof parsed.exportedAt).toBe('number')
  })
})

// ---------------------------------------------------------------------------
// agentId field
// ---------------------------------------------------------------------------

describe('buildSessionsJson — agentId field', () => {
  it('content includes the correct agentId', () => {
    const { content } = buildSessionsJson('my-agent', [], [], new Date(2026, 3, 26))
    const parsed = JSON.parse(content) as { agentId: string }
    expect(parsed.agentId).toBe('my-agent')
  })

  it('empty agentId is preserved in content as empty string', () => {
    const { content } = buildSessionsJson('', [], [], new Date(2026, 3, 26))
    const parsed = JSON.parse(content) as { agentId: string }
    expect(parsed.agentId).toBe('')
  })
})

// ---------------------------------------------------------------------------
// sessions array
// ---------------------------------------------------------------------------

describe('buildSessionsJson — sessions array', () => {
  it('empty sessions produces valid JSON with empty sessions array', () => {
    const { content } = buildSessionsJson('agent-1', [], [], new Date(2026, 3, 26))
    const parsed = JSON.parse(content) as { sessions: unknown[] }
    expect(Array.isArray(parsed.sessions)).toBe(true)
    expect(parsed.sessions).toHaveLength(0)
  })

  it('sessions array contains all provided sessions', () => {
    const { content } = buildSessionsJson('agent-1', [s1, s2], [], new Date(2026, 3, 26))
    const parsed = JSON.parse(content) as { sessions: SessionForJson[] }
    expect(parsed.sessions).toHaveLength(2)
  })

  it('session fields are preserved in the JSON output', () => {
    const { content } = buildSessionsJson('agent-1', [s1], [], new Date(2026, 3, 26))
    const parsed = JSON.parse(content) as { sessions: SessionForJson[] }
    const first = parsed.sessions[0]
    expect(first.id).toBe(s1.id)
    expect(first.preview).toBe(s1.preview)
    expect(first.title).toBe(s1.title)
  })

  it('session with null fields serialises correctly', () => {
    const { content } = buildSessionsJson('agent-1', [s2], [], new Date(2026, 3, 26))
    const parsed = JSON.parse(content) as { sessions: SessionForJson[] }
    const first = parsed.sessions[0]
    expect(first.preview).toBeNull()
    expect(first.title).toBeNull()
  })

  it('session with missing optional fields serialises without them', () => {
    const { content } = buildSessionsJson('agent-1', [s3], [], new Date(2026, 3, 26))
    const parsed = JSON.parse(content) as { sessions: SessionForJson[] }
    const first = parsed.sessions[0]
    expect(first.id).toBe('sess-no-preview')
  })
})

// ---------------------------------------------------------------------------
// bookmarkedIds array
// ---------------------------------------------------------------------------

describe('buildSessionsJson — bookmarkedIds array', () => {
  it('empty bookmarkedIds produces valid JSON with empty bookmarkedIds array', () => {
    const { content } = buildSessionsJson('agent-1', [], [], new Date(2026, 3, 26))
    const parsed = JSON.parse(content) as { bookmarkedIds: string[] }
    expect(Array.isArray(parsed.bookmarkedIds)).toBe(true)
    expect(parsed.bookmarkedIds).toHaveLength(0)
  })

  it('bookmarkedIds array contains all provided ids', () => {
    const { content } = buildSessionsJson('agent-1', [s1, s2], [s1.id], new Date(2026, 3, 26))
    const parsed = JSON.parse(content) as { bookmarkedIds: string[] }
    expect(parsed.bookmarkedIds).toHaveLength(1)
    expect(parsed.bookmarkedIds[0]).toBe(s1.id)
  })

  it('multiple bookmarkedIds are preserved', () => {
    const { content } = buildSessionsJson(
      'agent-1',
      [s1, s2],
      [s1.id, s2.id],
      new Date(2026, 3, 26),
    )
    const parsed = JSON.parse(content) as { bookmarkedIds: string[] }
    expect(parsed.bookmarkedIds).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// JSON round-trip & format
// ---------------------------------------------------------------------------

describe('buildSessionsJson — JSON round-trip', () => {
  it('content is valid JSON that round-trips through JSON.parse', () => {
    const { content } = buildSessionsJson('agent-1', [s1, s2], [s1.id], new Date(2026, 3, 26))
    expect(() => JSON.parse(content)).not.toThrow()
  })

  it('parsed object has exactly the expected top-level keys', () => {
    const { content } = buildSessionsJson('agent-1', [], [], new Date(2026, 3, 26))
    const parsed = JSON.parse(content) as Record<string, unknown>
    expect(Object.keys(parsed).sort()).toEqual(['agentId', 'bookmarkedIds', 'exportedAt', 'sessions'])
  })

  it('content is pretty-printed (indented)', () => {
    const { content } = buildSessionsJson('agent-1', [], [], new Date(2026, 3, 26))
    expect(content).toContain('\n')
    expect(content).toContain('  ')
  })
})
