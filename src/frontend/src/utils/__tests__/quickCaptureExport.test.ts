import { describe, it, expect, beforeAll } from 'vitest'
import { buildExport } from '../quickCaptureExport'
import type { QuickCaptureExportOutput } from '../quickCaptureExport'
import type { Capture } from '../quickCapture'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOW = new Date(2026, 3, 26, 9, 0) // 2026-04-26 09:00 (local)

function cap(overrides: Partial<Capture> & { body: string }): Capture {
  return {
    id: `qc_test_${Math.random().toString(36).slice(2)}`,
    context: 'dashboard',
    createdAt: new Date(2026, 3, 26, 8, 30).getTime(),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Empty captures
// ---------------------------------------------------------------------------

describe('buildExport — empty captures', () => {
  let result: QuickCaptureExportOutput

  beforeAll(() => {
    result = buildExport([], NOW)
  })

  it('filename matches quick-captures-YYYY-MM-DD.md', () => {
    expect(result.filename).toMatch(/^quick-captures-\d{4}-\d{2}-\d{2}\.md$/)
    expect(result.filename).toContain('2026-04-26')
  })

  it('content contains placeholder text when empty', () => {
    expect(result.content).toContain('_尚無 captures_')
  })

  it('content still contains the export timestamp header', () => {
    expect(result.content).toContain('匯出於')
    expect(result.content).toContain('2026-04-26')
  })
})

// ---------------------------------------------------------------------------
// Single capture without tags
// ---------------------------------------------------------------------------

describe('buildExport — single capture without tags', () => {
  let result: QuickCaptureExportOutput

  beforeAll(() => {
    const c = cap({ body: 'Plain note without any tag', context: 'chat', createdAt: new Date(2026, 3, 26, 8, 5).getTime() })
    result = buildExport([c], NOW)
  })

  it('includes the capture body in content', () => {
    expect(result.content).toContain('Plain note without any tag')
  })

  it('includes the timestamp formatted as YYYY-MM-DD HH:mm', () => {
    expect(result.content).toContain('2026-04-26 08:05')
  })

  it('includes the context label', () => {
    expect(result.content).toContain('chat')
  })

  it('places capture under the untagged section', () => {
    expect(result.content).toContain('## 無 tag')
  })

  it('does not produce any tag section header', () => {
    // No ## #<tag> line should appear
    expect(result.content).not.toMatch(/^## #\w/m)
  })
})

// ---------------------------------------------------------------------------
// Single capture with a tag
// ---------------------------------------------------------------------------

describe('buildExport — single capture with #bug tag', () => {
  let result: QuickCaptureExportOutput

  beforeAll(() => {
    const c = cap({ body: 'Found #bug in login flow' })
    result = buildExport([c], NOW)
  })

  it('produces a ## #bug section header', () => {
    expect(result.content).toContain('## #bug')
  })

  it('body is present under the tag section', () => {
    expect(result.content).toContain('Found #bug in login flow')
  })

  it('does not produce an untagged section', () => {
    expect(result.content).not.toContain('## 無 tag')
  })
})

// ---------------------------------------------------------------------------
// Mixed tagged and untagged
// ---------------------------------------------------------------------------

describe('buildExport — mix of tagged and untagged captures', () => {
  let result: QuickCaptureExportOutput

  beforeAll(() => {
    const tagged = cap({ body: 'Needs review #todo' })
    const plain = cap({ body: 'Just a plain idea' })
    result = buildExport([tagged, plain], NOW)
  })

  it('produces a tag section for #todo', () => {
    expect(result.content).toContain('## #todo')
  })

  it('produces an untagged section', () => {
    expect(result.content).toContain('## 無 tag')
  })

  it('includes both capture bodies', () => {
    expect(result.content).toContain('Needs review #todo')
    expect(result.content).toContain('Just a plain idea')
  })
})

// ---------------------------------------------------------------------------
// Grouping: same tag in multiple captures
// ---------------------------------------------------------------------------

describe('buildExport — multiple captures share one tag', () => {
  let result: QuickCaptureExportOutput

  beforeAll(() => {
    const c1 = cap({ body: 'First #idea' })
    const c2 = cap({ body: 'Second #idea' })
    const c3 = cap({ body: 'Third #idea' })
    result = buildExport([c1, c2, c3], NOW)
  })

  it('produces exactly one ## #idea section', () => {
    const matches = result.content.match(/## #idea/g)
    expect(matches).toHaveLength(1)
  })

  it('section header shows count (3)', () => {
    expect(result.content).toContain('## #idea (3)')
  })

  it('all three bodies appear in content', () => {
    expect(result.content).toContain('First #idea')
    expect(result.content).toContain('Second #idea')
    expect(result.content).toContain('Third #idea')
  })
})

// ---------------------------------------------------------------------------
// Sorting: ties broken alphabetically
// ---------------------------------------------------------------------------

describe('buildExport — tie-breaking is alphabetical when counts equal', () => {
  let result: QuickCaptureExportOutput

  beforeAll(() => {
    // #zebra and #alpha each appear once
    const c1 = cap({ body: 'one #zebra' })
    const c2 = cap({ body: 'two #alpha' })
    result = buildExport([c1, c2], NOW)
  })

  it('#alpha section appears before #zebra section in content', () => {
    const alphaIdx = result.content.indexOf('## #alpha')
    const zebraIdx = result.content.indexOf('## #zebra')
    expect(alphaIdx).toBeGreaterThanOrEqual(0)
    expect(zebraIdx).toBeGreaterThanOrEqual(0)
    expect(alphaIdx).toBeLessThan(zebraIdx)
  })
})

// ---------------------------------------------------------------------------
// Capture with multiple tags appears in each tag's section
// ---------------------------------------------------------------------------

describe('buildExport — capture with multiple tags listed in each section', () => {
  let result: QuickCaptureExportOutput

  beforeAll(() => {
    const c = cap({ body: 'Dual-tag item #feature #urgent' })
    result = buildExport([c], NOW)
  })

  it('produces a ## #feature section', () => {
    expect(result.content).toContain('## #feature')
  })

  it('produces a ## #urgent section', () => {
    expect(result.content).toContain('## #urgent')
  })

  it('body text appears at least twice (once per tag section)', () => {
    const occurrences = (result.content.match(/Dual-tag item/g) ?? []).length
    expect(occurrences).toBeGreaterThanOrEqual(2)
  })
})

// ---------------------------------------------------------------------------
// Multiline body indentation
// ---------------------------------------------------------------------------

describe('buildExport — multiline body is indented', () => {
  let result: QuickCaptureExportOutput

  beforeAll(() => {
    const c = cap({ body: 'Line one\nLine two\nLine three' })
    result = buildExport([c], NOW)
  })

  it('continuation lines are prefixed with two spaces', () => {
    expect(result.content).toContain('  Line two')
    expect(result.content).toContain('  Line three')
  })

  it('first line is not double-indented', () => {
    expect(result.content).toContain('Line one')
    // The bullet format starts with "- **[meta]**\n  Line one"
    expect(result.content).toMatch(/^\s+Line one$/m)
  })
})

// ---------------------------------------------------------------------------
// Summary line
// ---------------------------------------------------------------------------

describe('buildExport — summary line', () => {
  it('reports total captures count and tag count', () => {
    const c1 = cap({ body: 'item #foo' })
    const c2 = cap({ body: 'item #bar' })
    const c3 = cap({ body: 'no tag' })
    const { content } = buildExport([c1, c2, c3], NOW)
    expect(content).toContain('3 筆 captures')
    expect(content).toContain('2 個 tags')
  })
})
