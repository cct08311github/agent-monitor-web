import { describe, it, expect } from 'vitest'
import { extractTags, buildTagIndex, tagCounts, captureHasTag } from '../quickCaptureTags'
import type { Capture } from '../quickCapture'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCapture(id: string, body: string): Capture {
  return { id, body, context: 'test', createdAt: 0 }
}

// ---------------------------------------------------------------------------
// extractTags
// ---------------------------------------------------------------------------

describe('extractTags', () => {
  it('extracts a single tag from body', () => {
    expect(extractTags('hello #bug world')).toEqual(['bug'])
  })

  it('extracts multiple tags', () => {
    expect(extractTags('#a #b #c')).toEqual(['a', 'b', 'c'])
  })

  it('deduplicates tags (case-insensitive)', () => {
    expect(extractTags('#bug #BUG')).toEqual(['bug'])
  })

  it('returns [] for body with no tags', () => {
    expect(extractTags('hello world')).toEqual([])
  })

  it('supports CJK characters', () => {
    expect(extractTags('#決策')).toEqual(['決策'])
  })

  it('supports hyphenated tags', () => {
    expect(extractTags('#follow-up')).toEqual(['follow-up'])
  })

  it('returns [] for bare # with no chars', () => {
    expect(extractTags('#')).toEqual([])
  })

  it('returns [] when # is followed by a space', () => {
    expect(extractTags('# space')).toEqual([])
  })

  it('normalises to lowercase', () => {
    expect(extractTags('#TODO #Feature')).toEqual(['todo', 'feature'])
  })

  it('extracts tag at end of body without trailing space', () => {
    expect(extractTags('note about #performance')).toEqual(['performance'])
  })

  it('handles mixed CJK and ASCII tags', () => {
    expect(extractTags('#bug #決策 #follow-up')).toEqual(['bug', '決策', 'follow-up'])
  })

  it('returns tags in order of first appearance', () => {
    expect(extractTags('#z #a #m')).toEqual(['z', 'a', 'm'])
  })
})

// ---------------------------------------------------------------------------
// buildTagIndex
// ---------------------------------------------------------------------------

describe('buildTagIndex', () => {
  it('returns empty map for empty input', () => {
    expect(buildTagIndex([])).toEqual(new Map())
  })

  it('maps each tag to the captures containing it', () => {
    const c1 = makeCapture('1', '#a')
    const c2 = makeCapture('2', '#a #b')
    const index = buildTagIndex([c1, c2])

    expect(index.get('a')).toEqual([c1, c2])
    expect(index.get('b')).toEqual([c2])
    expect(index.has('c')).toBe(false)
  })

  it('does not create entries for captures without tags', () => {
    const c = makeCapture('1', 'no tags here')
    const index = buildTagIndex([c])
    expect(index.size).toBe(0)
  })

  it('handles duplicate tags within the same capture body', () => {
    const c = makeCapture('1', '#bug #bug is important')
    const index = buildTagIndex([c])
    // Should only appear once per capture
    expect(index.get('bug')).toEqual([c])
    expect(index.get('bug')?.length).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// tagCounts
// ---------------------------------------------------------------------------

describe('tagCounts', () => {
  it('returns [] for empty input', () => {
    expect(tagCounts([])).toEqual([])
  })

  it('counts occurrences across captures', () => {
    const captures = [
      makeCapture('1', '#a #b'),
      makeCapture('2', '#a'),
      makeCapture('3', '#b'),
    ]
    const counts = tagCounts(captures)
    const a = counts.find((t) => t.tag === 'a')
    const b = counts.find((t) => t.tag === 'b')
    expect(a?.count).toBe(2)
    expect(b?.count).toBe(2)
  })

  it('sorts by count descending', () => {
    const captures = [
      makeCapture('1', '#a'),
      makeCapture('2', '#b #b-dup'), // b appears once, b-dup once
      makeCapture('3', '#a'),
      makeCapture('4', '#a'),
    ]
    const counts = tagCounts(captures)
    expect(counts[0].tag).toBe('a')
    expect(counts[0].count).toBe(3)
  })

  it('breaks count ties alphabetically (ascending)', () => {
    const captures = [
      makeCapture('1', '#z #a'),
      makeCapture('2', '#z #a'),
    ]
    const counts = tagCounts(captures)
    // Both a and z have count 2; a comes before z alphabetically
    expect(counts[0].tag).toBe('a')
    expect(counts[1].tag).toBe('z')
  })

  it('returns a single entry for a tag used once', () => {
    expect(tagCounts([makeCapture('1', '#only')])).toEqual([{ tag: 'only', count: 1 }])
  })
})

// ---------------------------------------------------------------------------
// captureHasTag
// ---------------------------------------------------------------------------

describe('captureHasTag', () => {
  it('returns true when capture body contains the tag', () => {
    expect(captureHasTag(makeCapture('1', 'found a #bug today'), 'bug')).toBe(true)
  })

  it('returns false when tag is absent', () => {
    expect(captureHasTag(makeCapture('1', 'no tags here'), 'bug')).toBe(false)
  })

  it('is case-insensitive for the tag argument', () => {
    const c = makeCapture('1', '#BUG is critical')
    expect(captureHasTag(c, 'bug')).toBe(true)
    expect(captureHasTag(c, 'BUG')).toBe(true)
    expect(captureHasTag(c, 'Bug')).toBe(true)
  })

  it('does not match partial tag names', () => {
    // #bugfix should not match tag "bug"
    expect(captureHasTag(makeCapture('1', '#bugfix'), 'bug')).toBe(false)
  })

  it('supports CJK tag lookups', () => {
    expect(captureHasTag(makeCapture('1', '重要 #決策 要做'), '決策')).toBe(true)
  })
})
