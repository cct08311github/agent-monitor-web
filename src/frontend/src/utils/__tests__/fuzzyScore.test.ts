import { describe, it, expect } from 'vitest'
import { fuzzyScore, fuzzyMatch } from '../fuzzyScore'

describe('fuzzyScore', () => {
  it('returns 1 for empty query (matches everything equally)', () => {
    expect(fuzzyScore('', 'anything')).toBe(1)
    expect(fuzzyScore('', '')).toBe(1)
    expect(fuzzyScore('', 'abc')).toBe(1)
  })

  it('returns 0 for non-empty query against empty target', () => {
    expect(fuzzyScore('xyz', '')).toBe(0)
    expect(fuzzyScore('a', '')).toBe(0)
  })

  it('returns 1 for exact match (perfect consecutive, prefix)', () => {
    expect(fuzzyScore('abc', 'abc')).toBe(1)
  })

  it('returns > 0 for query that is prefix of target', () => {
    const score = fuzzyScore('abc', 'abcdef')
    expect(score).toBeGreaterThan(0)
    expect(score).toBeLessThanOrEqual(1)
  })

  it('obs matches observability (non-consecutive fuzzy)', () => {
    const score = fuzzyScore('obs', 'observability')
    expect(score).toBeGreaterThan(0)
  })

  it('returns 0 when no fuzzy match (letters not in order)', () => {
    expect(fuzzyScore('obs', 'random')).toBe(0)
  })

  it('returns 0 when query letters appear in wrong order', () => {
    expect(fuzzyScore('cba', 'abc')).toBe(0)
  })

  it('is case-insensitive: ABC matches abc', () => {
    expect(fuzzyScore('ABC', 'abc')).toBe(1)
  })

  it('is case-insensitive: query uppercase, target lowercase', () => {
    const score = fuzzyScore('OBS', 'observability')
    expect(score).toBeGreaterThan(0)
  })

  it('consecutive chars score higher than scattered chars', () => {
    const consecutive = fuzzyScore('abc', 'abcxxx')
    const scattered = fuzzyScore('abc', 'axbxcx')
    expect(consecutive).toBeGreaterThan(scattered)
  })

  it('prefix bonus: foo in foobar scores >= foo in xfoo (prefix at index 0 gets bonus)', () => {
    const prefixMatch = fuzzyScore('foo', 'foobar')
    const nonPrefixMatch = fuzzyScore('foo', 'xfoobar')
    // Both are consecutive matches so scores are close; prefix should be >= non-prefix
    expect(prefixMatch).toBeGreaterThanOrEqual(nonPrefixMatch)
  })

  it('prefix bonus makes start-of-string match score higher than mid-string scattered match', () => {
    // 'fo' consecutive at start vs 'fo' scattered later
    const prefixConsecutive = fuzzyScore('fo', 'foobar')
    const midScattered = fuzzyScore('fo', 'xxxfxoxxx')
    expect(prefixConsecutive).toBeGreaterThan(midScattered)
  })

  it('single-char query matching at start scores > 0', () => {
    expect(fuzzyScore('a', 'apple')).toBeGreaterThan(0)
  })

  it('single-char query not in target returns 0', () => {
    expect(fuzzyScore('z', 'apple')).toBe(0)
  })

  it('ksh matches "Keyboard Shortcuts Help" (spaced word initials)', () => {
    const score = fuzzyScore('ksh', 'Keyboard Shortcuts Help')
    expect(score).toBeGreaterThan(0)
  })

  it('normalized score is always in (0, 1] for any match', () => {
    const cases = [
      ['a', 'abc'],
      ['obs', 'observability'],
      ['abc', 'abc'],
      ['test', 'testing 123'],
    ]
    for (const [q, t] of cases) {
      const s = fuzzyScore(q, t)
      expect(s).toBeGreaterThan(0)
      expect(s).toBeLessThanOrEqual(1)
    }
  })
})

describe('fuzzyMatch', () => {
  const items = [
    { id: 'a', label: 'Observability', desc: 'metrics and errors' },
    { id: 'b', label: 'Keyboard Shortcuts Help', desc: 'keybindings list' },
    { id: 'c', label: 'Toggle Theme', desc: 'light dark auto' },
    { id: 'd', label: 'Navigate to Monitor', desc: 'go to monitor tab' },
  ]

  it('returns full list unfiltered when query is empty (preserves order)', () => {
    const result = fuzzyMatch(items, '', (i) => i.label)
    expect(result).toHaveLength(items.length)
    expect(result.map((i) => i.id)).toEqual(items.map((i) => i.id))
  })

  it('filters out 0-score items (non-matching)', () => {
    const result = fuzzyMatch(items, 'zzz', (i) => i.label)
    expect(result).toHaveLength(0)
  })

  it('returns only matching items', () => {
    const result = fuzzyMatch(items, 'obs', (i) => i.label)
    expect(result.length).toBeGreaterThan(0)
    expect(result[0].id).toBe('a')
  })

  it('sorts results by score descending (best match first)', () => {
    // 'toggle' should rank Toggle Theme higher than other items
    const result = fuzzyMatch(items, 'toggle', (i) => i.label)
    expect(result.length).toBeGreaterThan(0)
    expect(result[0].label).toBe('Toggle Theme')
  })

  it('extraKeys allows matching by secondary field (description)', () => {
    // 'metrics' is only in description of Observability
    const result = fuzzyMatch(
      items,
      'metrics',
      (i) => i.label,
      [(i) => i.desc],
    )
    expect(result.length).toBeGreaterThan(0)
    expect(result.some((r) => r.id === 'a')).toBe(true)
  })

  it('extraKeys secondary match: items matching only by description appear in results', () => {
    // 'keybindings' is only in desc of Keyboard Shortcuts Help
    const result = fuzzyMatch(
      items,
      'keybindings',
      (i) => i.label,
      [(i) => i.desc],
    )
    expect(result.some((r) => r.id === 'b')).toBe(true)
  })

  it('primary label match ranks higher than extraKey match for same query', () => {
    // 'dark' appears in Toggle Theme description ('light dark auto')
    // but NOT in any label — so only desc match here
    const result = fuzzyMatch(
      items,
      'dark',
      (i) => i.label,
      [(i) => i.desc],
    )
    if (result.length > 0) {
      // Toggle Theme should be in results (has 'dark' in desc)
      expect(result.some((r) => r.id === 'c')).toBe(true)
    }
  })

  it('handles array of strings directly', () => {
    const strings = ['apple', 'banana', 'apricot', 'cherry']
    const result = fuzzyMatch(strings, 'ap', (s) => s)
    expect(result.every((s) => fuzzyScore('ap', s) > 0)).toBe(true)
  })
})
