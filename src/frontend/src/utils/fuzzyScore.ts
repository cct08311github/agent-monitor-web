/**
 * Score how well a query matches a target string.
 * Returns 0 if not a fuzzy match (query letters must appear in target in order).
 * Returns a value in (0, 1]; higher is better.
 *
 * Scoring logic:
 * - Empty query → 1 (matches everything equally)
 * - Each query char must appear in target IN ORDER (case-insensitive)
 * - Consecutive matches get a bonus (e.g., 'obs' in 'Obs...' scores higher than 'O.b.s')
 * - Match starting at index 0 gets a small prefix bonus
 * - Final score normalized to (0, 1]
 */
export function fuzzyScore(query: string, target: string): number {
  if (!query) return 1
  const q = query.toLowerCase()
  const t = target.toLowerCase()
  if (!t) return 0

  let score = 0
  let qi = 0
  let lastMatchIdx = -2 // -2 so first index 0 won't count as consecutive
  let consecutive = 0
  let firstMatchIdx = -1

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      if (firstMatchIdx === -1) firstMatchIdx = ti
      if (ti === lastMatchIdx + 1) {
        consecutive += 1
        score += 1 + consecutive // consecutive bonus grows
      } else {
        score += 1
        consecutive = 0
      }
      lastMatchIdx = ti
      qi += 1
    }
  }

  if (qi < q.length) return 0 // not all query chars matched

  // Normalize: max possible if every query char matches consecutively starting from 0
  // = sum_{k=1}^{n} (1 + (k-1)) = n + n*(n-1)/2
  const n = q.length
  const maxScore = n + (n * (n - 1)) / 2
  let normalized = score / maxScore // (0, 1]

  // Prefix bonus
  if (firstMatchIdx === 0) normalized = Math.min(1, normalized * 1.05)

  return normalized
}

export interface FuzzyResult<T> {
  item: T
  score: number
}

export function fuzzyMatch<T>(
  items: ReadonlyArray<T>,
  query: string,
  getKey: (t: T) => string,
  extraKeys?: ReadonlyArray<(t: T) => string>,
): T[] {
  if (!query) return [...items] // unfiltered when empty
  const scored: FuzzyResult<T>[] = []
  for (const item of items) {
    const primary = fuzzyScore(query, getKey(item))
    let best = primary
    if (extraKeys) {
      for (const fn of extraKeys) {
        const s = fuzzyScore(query, fn(item)) * 0.85 // secondary keys discounted
        if (s > best) best = s
      }
    }
    if (best > 0) scored.push({ item, score: best })
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.map((r) => r.item)
}
