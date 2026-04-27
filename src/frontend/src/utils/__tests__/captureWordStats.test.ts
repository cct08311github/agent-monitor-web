import { describe, it, expect } from 'vitest'
import { countWords, computeWordStats, formatWordCount } from '../captureWordStats'
import type { Capture } from '../quickCapture'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCapture(id: string, body: string): Capture {
  return { id, body, context: 'test', createdAt: Date.now() }
}

// ---------------------------------------------------------------------------
// countWords
// ---------------------------------------------------------------------------

describe('countWords', () => {
  it('counts ASCII words split by whitespace', () => {
    expect(countWords('hello world')).toBe(2)
  })

  it('counts each CJK character as one word', () => {
    expect(countWords('測試文字')).toBe(4)
  })

  it('handles mixed CJK + ASCII correctly', () => {
    expect(countWords('hello 測試')).toBe(3)
  })

  it('returns 0 for empty string', () => {
    expect(countWords('')).toBe(0)
  })

  it('returns 0 for whitespace-only string', () => {
    expect(countWords('   ')).toBe(0)
  })

  it('counts a single ASCII word', () => {
    expect(countWords('hello')).toBe(1)
  })

  it('handles multiple spaces between words', () => {
    expect(countWords('one  two   three')).toBe(3)
  })

  it('handles Japanese hiragana as CJK', () => {
    // あいう = 3 hiragana characters
    expect(countWords('あいう')).toBe(3)
  })

  it('handles a sentence with trailing/leading spaces', () => {
    expect(countWords('  hello world  ')).toBe(2)
  })

  it('counts mixed sentence with punctuation correctly', () => {
    // "今天 hello 世界" = 2 CJK + 1 ASCII token + 2 CJK = wait…
    // '今天' = 2, 'hello' = 1 token, '世界' = 2 → total 5
    expect(countWords('今天 hello 世界')).toBe(5)
  })
})

// ---------------------------------------------------------------------------
// computeWordStats
// ---------------------------------------------------------------------------

describe('computeWordStats', () => {
  it('returns all zeros for empty array', () => {
    const result = computeWordStats([])
    expect(result).toEqual({
      totalWords: 0,
      totalCaptures: 0,
      averageWords: 0,
      longestWords: 0,
      longestCaptureId: null,
    })
  })

  it('computes totals for a single capture', () => {
    const caps = [makeCapture('a', 'hello world')]
    const result = computeWordStats(caps)
    expect(result.totalWords).toBe(2)
    expect(result.totalCaptures).toBe(1)
    expect(result.averageWords).toBe(2)
    expect(result.longestWords).toBe(2)
    expect(result.longestCaptureId).toBe('a')
  })

  it('sums totalWords across multiple captures', () => {
    const caps = [makeCapture('a', 'hello world'), makeCapture('b', 'foo bar baz')]
    const result = computeWordStats(caps)
    expect(result.totalWords).toBe(5) // 2 + 3
    expect(result.totalCaptures).toBe(2)
  })

  it('longestCaptureId points to the capture with most words', () => {
    const caps = [
      makeCapture('short', 'hi'),
      makeCapture('long', 'one two three four five'),
      makeCapture('medium', 'a b c'),
    ]
    const result = computeWordStats(caps)
    expect(result.longestCaptureId).toBe('long')
    expect(result.longestWords).toBe(5)
  })

  it('rounds averageWords to nearest integer', () => {
    // 3 words total, 2 captures → avg = 1.5 → rounds to 2
    const caps = [makeCapture('a', 'hello'), makeCapture('b', 'foo bar')]
    const result = computeWordStats(caps)
    expect(result.averageWords).toBe(2) // Math.round(1.5) = 2
  })

  it('handles CJK captures in aggregate', () => {
    const caps = [makeCapture('c1', '你好'), makeCapture('c2', 'hello 世界')]
    const result = computeWordStats(caps)
    // '你好' = 2, 'hello 世界' = 1 + 2 = 3 → total 5
    expect(result.totalWords).toBe(5)
    expect(result.longestCaptureId).toBe('c2')
    expect(result.longestWords).toBe(3)
  })

  it('handles captures with empty body', () => {
    const caps = [makeCapture('a', ''), makeCapture('b', 'hello world')]
    const result = computeWordStats(caps)
    expect(result.totalWords).toBe(2)
    expect(result.longestCaptureId).toBe('b')
  })

  it('averageWords is 0 when all bodies are empty', () => {
    const caps = [makeCapture('a', ''), makeCapture('b', '   ')]
    const result = computeWordStats(caps)
    expect(result.averageWords).toBe(0)
    // longestCaptureId could be either (both are 0); longestWords should be 0
    expect(result.longestWords).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// formatWordCount
// ---------------------------------------------------------------------------

describe('formatWordCount', () => {
  it('returns plain string for numbers under 1000', () => {
    expect(formatWordCount(500)).toBe('500')
  })

  it('returns plain string for 0', () => {
    expect(formatWordCount(0)).toBe('0')
  })

  it('returns plain string for 999', () => {
    expect(formatWordCount(999)).toBe('999')
  })

  it('formats 1000 as 1.0k', () => {
    expect(formatWordCount(1000)).toBe('1.0k')
  })

  it('formats 1500 as 1.5k', () => {
    expect(formatWordCount(1500)).toBe('1.5k')
  })

  it('formats 12300 as 12.3k', () => {
    expect(formatWordCount(12300)).toBe('12.3k')
  })

  it('formats 10000 as 10.0k', () => {
    expect(formatWordCount(10000)).toBe('10.0k')
  })
})
