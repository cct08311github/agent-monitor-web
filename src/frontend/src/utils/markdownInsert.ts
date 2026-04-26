/**
 * markdownInsert — helpers for inserting / wrapping markdown syntax in a
 * textarea.  All functions are pure (no DOM side-effects) so they are easy
 * to unit-test in isolation.
 */

export interface InsertResult {
  /** The full updated textarea value. */
  text: string
  /** New selectionStart (cursor or start of re-selected range). */
  selectionStart: number
  /** New selectionEnd (cursor or end of re-selected range). */
  selectionEnd: number
}

/**
 * Wrap the selected range [start, end) in `prefix` + `suffix`.
 *
 * - When the selection is non-empty the selected text is preserved; the
 *   result re-selects the wrapped text (excluding the delimiters) so the
 *   user can immediately type to replace it.
 * - When the caret is collapsed (start === end) the `placeholder` is
 *   inserted between the delimiters and is left selected so the user can
 *   type to replace it.
 */
export function wrapSelection(
  value: string,
  start: number,
  end: number,
  prefix: string,
  suffix: string,
  placeholder: string,
): InsertResult {
  const selected = value.slice(start, end)
  if (selected) {
    const before = value.slice(0, start)
    const after = value.slice(end)
    const text = before + prefix + selected + suffix + after
    return {
      text,
      selectionStart: before.length + prefix.length,
      selectionEnd: before.length + prefix.length + selected.length,
    }
  } else {
    const before = value.slice(0, start)
    const after = value.slice(end)
    const text = before + prefix + placeholder + suffix + after
    return {
      text,
      selectionStart: before.length + prefix.length,
      selectionEnd: before.length + prefix.length + placeholder.length,
    }
  }
}

/**
 * Prepend `prefix` to the line that contains `caret`.
 *
 * - If the line already starts with `prefix`, this is a no-op (returns
 *   the original value unchanged with the caret in place).
 * - Otherwise, `prefix` is inserted at the start of that line and the
 *   caret advances by `prefix.length`.
 */
export function prependLine(value: string, caret: number, prefix: string): InsertResult {
  // Find the start of the current line.
  const lineStart = value.lastIndexOf('\n', caret - 1) + 1
  const lineEnd = value.indexOf('\n', caret)
  const eol = lineEnd === -1 ? value.length : lineEnd
  const lineSlice = value.slice(lineStart, eol)

  // Already has the prefix → no-op.
  if (lineSlice.startsWith(prefix)) {
    return { text: value, selectionStart: caret, selectionEnd: caret }
  }

  const before = value.slice(0, lineStart)
  const after = value.slice(lineStart)
  const text = before + prefix + after
  return {
    text,
    selectionStart: caret + prefix.length,
    selectionEnd: caret + prefix.length,
  }
}
