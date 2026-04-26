/**
 * quickCaptureTags.ts — #hashtag extraction and tag-based utilities for Quick Capture.
 *
 * Tag rules:
 *   - `#word` — one or more word chars, CJK characters, hyphens, or underscores
 *   - Tags are normalised to lowercase
 *   - Bare `#` or `# space` does not produce a tag (requires at least 1 non-whitespace char after `#`)
 */

import type { Capture } from './quickCapture'

// Matches # followed by word chars, CJK Unified Ideographs (U+4E00-U+9FA5), hyphen, or underscore.
// At least one character must follow the `#`.
const TAG_REGEX = /#([\w一-龥\-]+)/g

/**
 * Extract unique lowercase tags from a capture body.
 * Returns tags in order of first appearance.
 */
export function extractTags(body: string): string[] {
  const found = new Set<string>()
  for (const match of body.matchAll(TAG_REGEX)) {
    const t = match[1].toLowerCase()
    if (t) found.add(t)
  }
  return Array.from(found)
}

/**
 * Build an index of tag → captures that contain that tag.
 */
export function buildTagIndex(captures: ReadonlyArray<Capture>): Map<string, Capture[]> {
  const index = new Map<string, Capture[]>()
  for (const c of captures) {
    for (const tag of extractTags(c.body)) {
      const arr = index.get(tag) ?? []
      arr.push(c)
      index.set(tag, arr)
    }
  }
  return index
}

/**
 * Compute per-tag counts across all captures, sorted by count desc then tag name asc.
 */
export function tagCounts(captures: ReadonlyArray<Capture>): Array<{ tag: string; count: number }> {
  const counts = new Map<string, number>()
  for (const c of captures) {
    for (const tag of extractTags(c.body)) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1)
    }
  }
  return Array.from(counts, ([tag, count]) => ({ tag, count })).sort(
    (a, b) => b.count - a.count || a.tag.localeCompare(b.tag),
  )
}

/**
 * Returns true if the capture body contains the given tag (case-insensitive).
 */
export function captureHasTag(capture: Capture, tag: string): boolean {
  return extractTags(capture.body).includes(tag.toLowerCase())
}
