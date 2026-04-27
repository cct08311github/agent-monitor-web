/**
 * captureWordStats.ts — word count statistics for Quick Capture.
 *
 * Handles CJK (each character = one word) and ASCII/western text
 * (split on whitespace).  Mixed strings are handled by stripping CJK
 * first, counting those characters separately, then splitting the
 * remaining tokens.
 */

import type { Capture } from './quickCapture'

export interface WordStats {
  totalWords: number
  totalCaptures: number
  /** Average words per capture, rounded to nearest integer. */
  averageWords: number
  /** Word count of the longest single capture. */
  longestWords: number
  /** ID of the capture with the most words, or null when there are none. */
  longestCaptureId: string | null
}

/**
 * Matches CJK Unified Ideographs (U+4E00–U+9FFF), Extension A (U+3400–U+4DBF),
 * Compatibility Ideographs (U+F900–U+FAFF), Hiragana (U+3040–U+309F),
 * Katakana (U+30A0–U+30FF), and a wider CJK extension block.
 */
const CJK_REGEX = /[一-鿿㐀-䶿豈-﫿぀-ゟ゠-ヿ]/g

/**
 * Count words in a string using a hybrid CJK + whitespace-token approach.
 *
 * - CJK characters: each character counts as one word.
 * - Non-CJK: strip CJK characters, then split on whitespace.
 *
 * Empty or whitespace-only strings return 0.
 */
export function countWords(s: string): number {
  if (!s || !s.trim()) return 0

  // Count CJK characters individually
  const cjkMatches = s.match(CJK_REGEX) ?? []
  const cjkCount = cjkMatches.length

  // Remove CJK chars and split remaining text by whitespace
  const stripped = s.replace(CJK_REGEX, ' ')
  const tokens = stripped.split(/\s+/).filter((t) => t.length > 0)

  return cjkCount + tokens.length
}

/**
 * Compute word-count aggregate stats across all captures.
 *
 * @param captures - Full list of captures to aggregate.
 */
export function computeWordStats(captures: ReadonlyArray<Capture>): WordStats {
  if (!captures.length) {
    return {
      totalWords: 0,
      totalCaptures: 0,
      averageWords: 0,
      longestWords: 0,
      longestCaptureId: null,
    }
  }

  let total = 0
  let longest = 0
  let longestId: string | null = null

  for (const c of captures) {
    const n = countWords(c.body)
    total += n
    if (n > longest) {
      longest = n
      longestId = c.id
    }
  }

  return {
    totalWords: total,
    totalCaptures: captures.length,
    averageWords: Math.round(total / captures.length),
    longestWords: longest,
    longestCaptureId: longestId,
  }
}

/**
 * Format a word count number for compact display.
 *
 * - >= 1000: rendered as 'N.Nk' (one decimal place).
 * - < 1000: rendered as the integer string.
 */
export function formatWordCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}
