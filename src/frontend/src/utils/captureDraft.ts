/**
 * captureDraft — persist unsaved Quick Capture text across modal closes.
 *
 * Draft is stored in localStorage under a single key. On open, the modal
 * loads the draft (unless prefillBody from a clone takes precedence).
 * On successful save the draft is cleared; on dismiss it is preserved.
 */

const KEY = 'oc_quick_capture_draft'

/** Return the stored draft, or '' if none / on error. */
export function loadDraft(): string {
  try {
    const raw = localStorage.getItem(KEY)
    return typeof raw === 'string' ? raw : ''
  } catch {
    return ''
  }
}

/**
 * Persist the draft.
 * Passing an empty string removes the key to avoid stale empty entries.
 */
export function saveDraft(text: string): void {
  try {
    if (text) {
      localStorage.setItem(KEY, text)
    } else {
      localStorage.removeItem(KEY)
    }
  } catch {
    // silent — storage unavailable (private mode, quota exceeded, etc.)
  }
}

/** Remove the draft key. Call after a successful save. */
export function clearDraft(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // silent
  }
}
