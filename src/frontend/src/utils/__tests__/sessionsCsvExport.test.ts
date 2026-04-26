import { describe, it, expect } from 'vitest'
import { buildSessionsCsv } from '../sessionsCsvExport'
import type { SessionForCsv } from '../sessionsCsvExport'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const s1: SessionForCsv = {
  id: 'sess-aabbccdd-1122-3344',
  createdAt: new Date(2026, 3, 26, 10, 5, 3).getTime(), // 2026-04-26 10:05:03 — numeric ts
  preview: 'Refactor authentication module',
  title: 'Auth refactor',
}

const s2: SessionForCsv = {
  id: 'sess-eeff0011-5566-7788',
  createdAt: '2026-04-25T08:00:00.000Z', // ISO string ts
  preview: null,
  firstMessage: 'Deploy to production server',
  title: null,
}

const s3: SessionForCsv = {
  id: 'sess-99aabb-special',
  createdAt: new Date(2026, 3, 24, 14, 30, 0).getTime(),
  preview: 'Fix memory leak, performance issue',
  title: 'She said "memory leak" again',
}

const s4: SessionForCsv = {
  id: 'sess-no-preview',
  // no createdAt, no preview, no firstMessage, no title
}

// ---------------------------------------------------------------------------
// header row
// ---------------------------------------------------------------------------

describe('buildSessionsCsv — header', () => {
  it('header row matches "id,createdAt,preview,title,bookmarked"', () => {
    const { content } = buildSessionsCsv('agent-1', [], [], new Date(2026, 3, 26))
    const firstLine = content.split('\n')[0]
    expect(firstLine).toBe('id,createdAt,preview,title,bookmarked')
  })

  it('empty sessions array produces only header + trailing newline', () => {
    const { content } = buildSessionsCsv('agent-1', [], [], new Date(2026, 3, 26))
    expect(content).toBe('id,createdAt,preview,title,bookmarked\n')
  })
})

// ---------------------------------------------------------------------------
// filename
// ---------------------------------------------------------------------------

describe('buildSessionsCsv — filename', () => {
  it('filename pattern matches sessions-{agentId}-YYYY-MM-DD.csv', () => {
    const { filename } = buildSessionsCsv('my-agent', [], [], new Date(2026, 3, 26))
    expect(filename).toMatch(/^sessions-my-agent-\d{4}-\d{2}-\d{2}\.csv$/)
  })

  it('filename encodes agentId and injectable now date correctly', () => {
    const { filename } = buildSessionsCsv('my-agent', [], [], new Date(2026, 3, 26))
    expect(filename).toBe('sessions-my-agent-2026-04-26.csv')
  })

  it('empty agentId falls back to "unknown"', () => {
    const { filename } = buildSessionsCsv('', [], [], new Date(2026, 3, 26))
    expect(filename).toBe('sessions-unknown-2026-04-26.csv')
  })

  it('filename pads month and day with leading zeros', () => {
    const { filename } = buildSessionsCsv('a', [], [], new Date(2024, 0, 7)) // 2024-01-07
    expect(filename).toBe('sessions-a-2024-01-07.csv')
  })
})

// ---------------------------------------------------------------------------
// rows
// ---------------------------------------------------------------------------

describe('buildSessionsCsv — rows', () => {
  it('produces one data row per session', () => {
    const { content } = buildSessionsCsv('agent-1', [s1, s2], [], new Date(2026, 3, 26))
    const lines = content.trimEnd().split('\n')
    expect(lines.length).toBe(3) // header + 2 data rows
  })

  it('simple session row has correct column values', () => {
    const { content } = buildSessionsCsv('agent-1', [s1], [], new Date(2026, 3, 26))
    const lines = content.trimEnd().split('\n')
    expect(lines[1]).toBe(
      'sess-aabbccdd-1122-3344,2026-04-26 10:05:03,Refactor authentication module,Auth refactor,false',
    )
  })
})

// ---------------------------------------------------------------------------
// bookmarked column
// ---------------------------------------------------------------------------

describe('buildSessionsCsv — bookmarked column', () => {
  it('bookmarked column is "true" for bookmarked sessions', () => {
    const { content } = buildSessionsCsv(
      'agent-1',
      [s1],
      [s1.id],
      new Date(2026, 3, 26),
    )
    const lines = content.trimEnd().split('\n')
    expect(lines[1]).toContain(',true')
  })

  it('bookmarked column is "false" for non-bookmarked sessions', () => {
    const { content } = buildSessionsCsv('agent-1', [s1], [], new Date(2026, 3, 26))
    const lines = content.trimEnd().split('\n')
    expect(lines[1]).toContain(',false')
  })

  it('mixed: bookmarked session shows true, non-bookmarked shows false', () => {
    const { content } = buildSessionsCsv(
      'agent-1',
      [s1, s2],
      [s1.id],
      new Date(2026, 3, 26),
    )
    const lines = content.trimEnd().split('\n')
    expect(lines[1]).toMatch(/,true$/)
    expect(lines[2]).toMatch(/,false$/)
  })
})

// ---------------------------------------------------------------------------
// preview fallback
// ---------------------------------------------------------------------------

describe('buildSessionsCsv — preview fallback', () => {
  it('uses firstMessage when preview is null', () => {
    const { content } = buildSessionsCsv('agent-1', [s2], [], new Date(2026, 3, 26))
    const lines = content.trimEnd().split('\n')
    expect(lines[1]).toContain('Deploy to production server')
  })

  it('missing preview and firstMessage exports empty string in preview column', () => {
    const { content } = buildSessionsCsv('agent-1', [s4], [], new Date(2026, 3, 26))
    const lines = content.trimEnd().split('\n')
    // id,createdAt(empty),preview(empty),title(empty),bookmarked=false
    expect(lines[1]).toBe('sess-no-preview,,,,false')
  })
})

// ---------------------------------------------------------------------------
// createdAt formats
// ---------------------------------------------------------------------------

describe('buildSessionsCsv — createdAt formats', () => {
  it('createdAt as numeric timestamp is formatted correctly', () => {
    const { content } = buildSessionsCsv('agent-1', [s1], [], new Date(2026, 3, 26))
    const lines = content.trimEnd().split('\n')
    expect(lines[1]).toMatch(/^sess-aabbccdd-1122-3344,2026-04-26 10:05:03,/)
  })

  it('createdAt as ISO string is formatted correctly', () => {
    const session: SessionForCsv = {
      id: 'sess-iso',
      createdAt: '2026-01-15T12:30:45.000Z',
    }
    const { content } = buildSessionsCsv('agent-1', [session], [], new Date(2026, 3, 26))
    const lines = content.trimEnd().split('\n')
    // We just verify it is non-empty and formatted (exact value depends on local TZ of the test runner,
    // but it should not be the raw ISO string)
    const row = lines[1]
    expect(row).toMatch(/^sess-iso,\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},/)
  })

  it('null createdAt exports as empty string', () => {
    const session: SessionForCsv = { id: 'sess-null-ts', createdAt: null }
    const { content } = buildSessionsCsv('agent-1', [session], [], new Date(2026, 3, 26))
    const lines = content.trimEnd().split('\n')
    // second column should be empty: id,,preview,title,bookmarked
    expect(lines[1]).toMatch(/^sess-null-ts,,/)
  })

  it('undefined createdAt exports as empty string', () => {
    const session: SessionForCsv = { id: 'sess-undef-ts' }
    const { content } = buildSessionsCsv('agent-1', [session], [], new Date(2026, 3, 26))
    const lines = content.trimEnd().split('\n')
    expect(lines[1]).toMatch(/^sess-undef-ts,,/)
  })
})

// ---------------------------------------------------------------------------
// RFC-4180 escaping
// ---------------------------------------------------------------------------

describe('buildSessionsCsv — RFC-4180 escaping', () => {
  it('preview containing comma is wrapped in double-quotes', () => {
    const { content } = buildSessionsCsv('agent-1', [s3], [], new Date(2026, 3, 26))
    expect(content).toContain('"Fix memory leak, performance issue"')
  })

  it('title containing double-quotes doubles them and wraps', () => {
    const { content } = buildSessionsCsv('agent-1', [s3], [], new Date(2026, 3, 26))
    expect(content).toContain('"She said ""memory leak"" again"')
  })

  it('id containing special characters is escaped', () => {
    const session: SessionForCsv = { id: 'id-with,"quotes', preview: 'test' }
    const { content } = buildSessionsCsv('agent-1', [session], [], new Date(2026, 3, 26))
    expect(content).toContain('"id-with,""quotes"')
  })
})

// ---------------------------------------------------------------------------
// trailing newline
// ---------------------------------------------------------------------------

describe('buildSessionsCsv — trailing newline', () => {
  it('content ends with a trailing newline for non-empty sessions', () => {
    const { content } = buildSessionsCsv('agent-1', [s1], [], new Date(2026, 3, 26))
    expect(content.endsWith('\n')).toBe(true)
  })

  it('empty export also ends with a trailing newline', () => {
    const { content } = buildSessionsCsv('agent-1', [], [], new Date(2026, 3, 26))
    expect(content.endsWith('\n')).toBe(true)
  })
})
