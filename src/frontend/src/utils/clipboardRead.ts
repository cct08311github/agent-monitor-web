// ---------------------------------------------------------------------------
// clipboardRead — thin wrapper around the Clipboard API readText()
//
// Provides graceful fallback when the API is unavailable or permission is
// denied, returning null instead of throwing.
// ---------------------------------------------------------------------------

/**
 * Returns true when navigator.clipboard.readText is available in the current
 * environment.  Handles SSR/test environments where `navigator` may be absent.
 */
export function isClipboardReadSupported(): boolean {
  if (typeof navigator === 'undefined') return false
  return typeof (navigator as { clipboard?: { readText?: unknown } }).clipboard?.readText === 'function'
}

/**
 * Reads text from the system clipboard.
 *
 * Returns:
 *  - The clipboard text string (may be empty '') on success.
 *  - `null` when the API is unsupported or the user has denied permission.
 */
export async function readClipboardText(): Promise<string | null> {
  if (!isClipboardReadSupported()) return null
  try {
    return await navigator.clipboard.readText()
  } catch {
    return null
  }
}
