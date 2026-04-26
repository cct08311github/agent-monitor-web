import type { Capture } from './quickCapture'

/**
 * Rename #oldTag → #newTag in a capture body.
 * Matching is case-insensitive and requires a word boundary after the tag name
 * so #bugs is NOT matched when oldTag is "bug".
 */
export function renameTagInBody(body: string, oldTag: string, newTag: string): string {
  const escaped = oldTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`#${escaped}\\b`, 'gi')
  return body.replace(re, `#${newTag}`)
}

/**
 * Remove all occurrences of #tag from a capture body.
 * Trailing/leading space is collapsed to avoid double spaces.
 */
export function removeTagFromBody(body: string, tag: string): string {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // Match optional leading space + #tag at word boundary
  const re = new RegExp(`\\s?#${escaped}\\b`, 'gi')
  return body.replace(re, '').replace(/\s+/g, ' ').trim()
}

export interface RenameResult {
  id: string
  oldBody: string
  newBody: string
}

/**
 * Apply a tag rename across all captures.
 * Returns only the captures whose body actually changed.
 */
export function applyTagRename(
  captures: ReadonlyArray<Capture>,
  oldTag: string,
  newTag: string,
): RenameResult[] {
  const out: RenameResult[] = []
  for (const c of captures) {
    const newBody = renameTagInBody(c.body, oldTag, newTag)
    if (newBody !== c.body) {
      out.push({ id: c.id, oldBody: c.body, newBody })
    }
  }
  return out
}

/**
 * Apply a tag removal across all captures.
 * Returns only the captures whose body actually changed.
 */
export function applyTagRemove(
  captures: ReadonlyArray<Capture>,
  tag: string,
): RenameResult[] {
  const out: RenameResult[] = []
  for (const c of captures) {
    const newBody = removeTagFromBody(c.body, tag)
    if (newBody !== c.body) {
      out.push({ id: c.id, oldBody: c.body, newBody })
    }
  }
  return out
}
