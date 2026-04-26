import { describe, it, expect } from 'vitest'
import { buildSessionsMarkdown } from '../sessionsMarkdownExport'
import type { SessionForMd } from '../sessionsMarkdownExport'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const s1: SessionForMd = {
  id: 'sess-aabbccdd-1122-3344',
  createdAt: new Date(2026, 3, 26, 10, 5, 0).getTime(), // 2026-04-26 10:05 — numeric ts
  preview: 'Refactor authentication module',
  title: 'Auth refactor',
}

const s2: SessionForMd = {
  id: 'sess-eeff0011-5566-7788',
  createdAt: '2026-04-25T08:00:00.000Z', // ISO string ts
  preview: null,
  firstMessage: 'Deploy to production server',
  title: null,
}

const s3: SessionForMd = {
  id: 'sess-no-title-no-preview',
  // no createdAt, no preview, no firstMessage, no title
}

const NOW = new Date(2026, 3, 26) // 2026-04-26

// ---------------------------------------------------------------------------
// filename
// ---------------------------------------------------------------------------

describe('buildSessionsMarkdown — filename', () => {
  it('filename matches sessions-{agentId}-YYYY-MM-DD.md pattern', () => {
    const { filename } = buildSessionsMarkdown('my-agent', 'My Agent', [], [], NOW)
    expect(filename).toMatch(/^sessions-my-agent-\d{4}-\d{2}-\d{2}\.md$/)
  })

  it('filename encodes agentId and injectable date correctly', () => {
    const { filename } = buildSessionsMarkdown('my-agent', 'My Agent', [], [], NOW)
    expect(filename).toBe('sessions-my-agent-2026-04-26.md')
  })

  it('empty agentId falls back to "unknown"', () => {
    const { filename } = buildSessionsMarkdown('', '', [], [], NOW)
    expect(filename).toBe('sessions-unknown-2026-04-26.md')
  })

  it('filename pads month and day with leading zeros', () => {
    const { filename } = buildSessionsMarkdown('a', 'A', [], [], new Date(2024, 0, 7)) // 2024-01-07
    expect(filename).toBe('sessions-a-2024-01-07.md')
  })
})

// ---------------------------------------------------------------------------
// agent header
// ---------------------------------------------------------------------------

describe('buildSessionsMarkdown — agent header', () => {
  it('includes agent id in the header', () => {
    const { content } = buildSessionsMarkdown('agt-99', 'agt-99', [s1], [], NOW)
    expect(content).toContain('`agt-99`')
  })

  it('includes agent name in the h1 heading', () => {
    const { content } = buildSessionsMarkdown('agt-99', 'My Cool Agent', [s1], [], NOW)
    expect(content).toContain('# Sessions — My Cool Agent')
  })

  it('includes 別名 line when agentName differs from agentId', () => {
    const { content } = buildSessionsMarkdown('agt-99', 'Cool Agent', [s1], [], NOW)
    expect(content).toContain('**別名:** Cool Agent')
  })

  it('does not include 別名 line when agentName equals agentId', () => {
    const { content } = buildSessionsMarkdown('agt-99', 'agt-99', [s1], [], NOW)
    expect(content).not.toContain('**別名:**')
  })

  it('includes sessions count', () => {
    const { content } = buildSessionsMarkdown('agt-99', 'agt-99', [s1, s2], [], NOW)
    expect(content).toContain('**Sessions count:** 2')
  })

  it('sessions count is 0 for empty list', () => {
    const { content } = buildSessionsMarkdown('agt-99', 'agt-99', [], [], NOW)
    expect(content).toContain('**Sessions count:** 0')
  })

  it('includes 匯出時間 export timestamp line', () => {
    const { content } = buildSessionsMarkdown('agt-99', 'agt-99', [], [], NOW)
    expect(content).toContain('**匯出時間:**')
  })
})

// ---------------------------------------------------------------------------
// empty sessions
// ---------------------------------------------------------------------------

describe('buildSessionsMarkdown — empty sessions', () => {
  it('produces valid markdown with header even when sessions are empty', () => {
    const { content } = buildSessionsMarkdown('agt-99', 'agt-99', [], [], NOW)
    expect(content).toContain('# Sessions —')
    expect(content).toContain('---')
  })

  it('empty sessions renders 尚無 sessions placeholder', () => {
    const { content } = buildSessionsMarkdown('agt-99', 'agt-99', [], [], NOW)
    expect(content).toContain('_尚無 sessions_')
  })

  it('non-empty sessions do not show the placeholder', () => {
    const { content } = buildSessionsMarkdown('agt-99', 'agt-99', [s1], [], NOW)
    expect(content).not.toContain('_尚無 sessions_')
  })
})

// ---------------------------------------------------------------------------
// bookmark marker (⭐)
// ---------------------------------------------------------------------------

describe('buildSessionsMarkdown — bookmark marker', () => {
  it('bookmarked session heading includes ⭐', () => {
    const { content } = buildSessionsMarkdown('agt-99', 'agt-99', [s1], [s1.id], NOW)
    expect(content).toContain(`## ⭐ Auth refactor`)
  })

  it('non-bookmarked session heading does not include ⭐', () => {
    const { content } = buildSessionsMarkdown('agt-99', 'agt-99', [s1], [], NOW)
    expect(content).not.toContain('⭐')
    expect(content).toContain('## Auth refactor')
  })

  it('only the bookmarked session in a mixed list gets ⭐', () => {
    const { content } = buildSessionsMarkdown('agt-99', 'agt-99', [s1, s2], [s1.id], NOW)
    const lines = content.split('\n')
    const headings = lines.filter((l) => l.startsWith('## '))
    expect(headings[0]).toContain('⭐')
    expect(headings[1]).not.toContain('⭐')
  })
})

// ---------------------------------------------------------------------------
// title fallback
// ---------------------------------------------------------------------------

describe('buildSessionsMarkdown — title fallback', () => {
  it('uses title as section heading when present', () => {
    const { content } = buildSessionsMarkdown('agt-99', 'agt-99', [s1], [], NOW)
    expect(content).toContain('## Auth refactor')
  })

  it('falls back to session id as section heading when title is absent', () => {
    const { content } = buildSessionsMarkdown('agt-99', 'agt-99', [s2], [], NOW)
    expect(content).toContain(`## ${s2.id}`)
  })
})

// ---------------------------------------------------------------------------
// preview fallback
// ---------------------------------------------------------------------------

describe('buildSessionsMarkdown — preview fallback', () => {
  it('uses preview when present', () => {
    const { content } = buildSessionsMarkdown('agt-99', 'agt-99', [s1], [], NOW)
    expect(content).toContain('Refactor authentication module')
  })

  it('falls back to firstMessage when preview is null', () => {
    const { content } = buildSessionsMarkdown('agt-99', 'agt-99', [s2], [], NOW)
    expect(content).toContain('Deploy to production server')
  })

  it('produces no body content line when both preview and firstMessage are absent', () => {
    const { content } = buildSessionsMarkdown('agt-99', 'agt-99', [s3], [], NOW)
    // The section should exist but have no body text after the ID line before the separator
    const lines = content.split('\n')
    const idLineIdx = lines.findIndex((l) => l.includes(`\`${s3.id}\``))
    expect(idLineIdx).toBeGreaterThan(-1)
    // Next non-empty line after the blank line should be the --- separator
    const afterId = lines.slice(idLineIdx + 1).filter((l) => l !== '')
    expect(afterId[0]).toBe('---')
  })
})

// ---------------------------------------------------------------------------
// session ID line
// ---------------------------------------------------------------------------

describe('buildSessionsMarkdown — session ID line', () => {
  it('each session includes an **ID:** code line', () => {
    const { content } = buildSessionsMarkdown('agt-99', 'agt-99', [s1], [], NOW)
    expect(content).toContain(`**ID:** \`${s1.id}\``)
  })
})

// ---------------------------------------------------------------------------
// timestamp
// ---------------------------------------------------------------------------

describe('buildSessionsMarkdown — session timestamp', () => {
  it('includes formatted timestamp when createdAt is set', () => {
    const { content } = buildSessionsMarkdown('agt-99', 'agt-99', [s1], [], NOW)
    expect(content).toContain('**時間:** 2026-04-26 10:05')
  })

  it('does not emit a 時間 line when createdAt is absent', () => {
    const { content } = buildSessionsMarkdown('agt-99', 'agt-99', [s3], [], NOW)
    // s3 has no createdAt; make sure no 時間 line appears for it
    // (the overall export time line will still have 匯出時間)
    expect(content).not.toContain('**時間:**')
  })
})

// ---------------------------------------------------------------------------
// trailing newline
// ---------------------------------------------------------------------------

describe('buildSessionsMarkdown — trailing newline', () => {
  it('content ends with a trailing newline for non-empty sessions', () => {
    const { content } = buildSessionsMarkdown('agt-99', 'agt-99', [s1], [], NOW)
    expect(content.endsWith('\n')).toBe(true)
  })

  it('empty export also ends with a trailing newline', () => {
    const { content } = buildSessionsMarkdown('agt-99', 'agt-99', [], [], NOW)
    expect(content.endsWith('\n')).toBe(true)
  })
})
