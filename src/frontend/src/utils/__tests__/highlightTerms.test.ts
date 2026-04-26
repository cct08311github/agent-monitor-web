import { describe, it, expect } from 'vitest'
import { highlightFuzzyMatch } from '../highlightTerms'

describe('highlightFuzzyMatch', () => {
  it('empty query returns single non-match token for entire target', () => {
    const result = highlightFuzzyMatch('hello', '')
    expect(result).toEqual([{ text: 'hello', isMatch: false }])
  })

  it('empty target returns empty array', () => {
    const result = highlightFuzzyMatch('', 'abc')
    expect(result).toEqual([])
  })

  it('exact prefix match highlights leading character only', () => {
    const result = highlightFuzzyMatch('hello', 'h')
    expect(result).toEqual([
      { text: 'h', isMatch: true },
      { text: 'ello', isMatch: false },
    ])
  })

  it('sequential match highlights matched chars with non-match between', () => {
    // 'obs' in 'observability': o=match, b=match, s=match with non-match spans between
    const result = highlightFuzzyMatch('observability', 'obs')
    // o(match), b(match, consecutive) — wait: 'o' at 0, then 'b' at 1 is consecutive
    // 'obs': o→idx0 match, b→idx1 match, s→idx2 match — all consecutive
    // so we get: 'obs'(match), 'ervability'(non-match)
    const matchTokens = result.filter((t) => t.isMatch)
    const combined = matchTokens.map((t) => t.text).join('')
    expect(combined).toBe('obs')
    // Verify the non-match remainder
    const nonMatchTokens = result.filter((t) => !t.isMatch)
    expect(nonMatchTokens.map((t) => t.text).join('')).toBe('ervability')
  })

  it('case insensitive: uppercase query matches lowercase target chars', () => {
    const result = highlightFuzzyMatch('observability', 'OBS')
    const matchTokens = result.filter((t) => t.isMatch)
    expect(matchTokens.map((t) => t.text).join('')).toBe('obs')
  })

  it('query letters not found in target → all non-match tokens', () => {
    const result = highlightFuzzyMatch('hello', 'xyz')
    expect(result.every((t) => !t.isMatch)).toBe(true)
    expect(result.map((t) => t.text).join('')).toBe('hello')
  })

  it('extra query letters past what target contains are ignored gracefully', () => {
    // 'hello' only has 5 chars, query 'helloo' has 6 — last 'o' is extra
    const result = highlightFuzzyMatch('hello', 'helloo')
    // 'h','e','l','l','o' all match; there is no extra 'o' to match
    const matchText = result.filter((t) => t.isMatch).map((t) => t.text).join('')
    expect(matchText).toBe('hello')
    // All characters accounted for
    expect(result.map((t) => t.text).join('')).toBe('hello')
  })

  it('non-consecutive fuzzy match: chars interleaved with non-matches', () => {
    // 'ac' in 'abcde': 'a'=match, 'b'=non-match, 'c'=match, 'de'=non-match
    const result = highlightFuzzyMatch('abcde', 'ac')
    expect(result).toEqual([
      { text: 'a', isMatch: true },
      { text: 'b', isMatch: false },
      { text: 'c', isMatch: true },
      { text: 'de', isMatch: false },
    ])
  })

  it('full match when query equals target', () => {
    const result = highlightFuzzyMatch('abc', 'abc')
    expect(result).toEqual([{ text: 'abc', isMatch: true }])
  })

  it('preserves original casing in token text', () => {
    const result = highlightFuzzyMatch('Hello World', 'hw')
    const matchText = result.filter((t) => t.isMatch).map((t) => t.text).join('')
    // 'H' matches 'h' and 'W' matches 'w'
    expect(matchText).toBe('HW')
    // Text reconstructed equals original
    expect(result.map((t) => t.text).join('')).toBe('Hello World')
  })
})
