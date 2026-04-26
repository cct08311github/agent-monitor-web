export interface HighlightToken {
  text: string
  isMatch: boolean
}

/**
 * Walk through target characters; advance through query as we find matches.
 * Returns tokens grouping consecutive same-state characters.
 *
 * Semantics:
 * - Fuzzy: query letters must appear in target IN ORDER (case-insensitive).
 * - Non-matching characters between matched characters are preserved as
 *   separate non-match tokens.
 * - When query is empty, the entire target is returned as a single non-match.
 * - When target is empty, returns an empty array.
 * - Extra query characters beyond what target contains are silently ignored
 *   (i.e. we only highlight the characters that actually matched).
 */
export function highlightFuzzyMatch(target: string, query: string): HighlightToken[] {
  if (!target) return []
  if (!query) return [{ text: target, isMatch: false }]

  const q = query.toLowerCase()
  const t = target.toLowerCase()
  const tokens: HighlightToken[] = []
  let qi = 0
  let buf = ''
  let bufIsMatch = false

  for (let i = 0; i < target.length; i++) {
    const isMatch = qi < q.length && t[i] === q[qi]
    if (isMatch) qi++

    if (i === 0) {
      buf = target[i]
      bufIsMatch = isMatch
    } else if (isMatch === bufIsMatch) {
      buf += target[i]
    } else {
      tokens.push({ text: buf, isMatch: bufIsMatch })
      buf = target[i]
      bufIsMatch = isMatch
    }
  }

  if (buf) tokens.push({ text: buf, isMatch: bufIsMatch })
  return tokens
}
