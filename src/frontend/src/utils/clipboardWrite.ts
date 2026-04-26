// ---------------------------------------------------------------------------
// clipboardWrite — thin wrapper around the Clipboard API writeText()
//
// Provides graceful fallback when the API is unavailable or permission is
// denied, returning false instead of throwing.
// ---------------------------------------------------------------------------

/**
 * Returns true when navigator.clipboard.writeText is available in the current
 * environment.  Handles SSR/test environments where `navigator` may be absent.
 */
export function isClipboardWriteSupported(): boolean {
  if (typeof navigator === 'undefined') return false
  return typeof (navigator as { clipboard?: { writeText?: unknown } }).clipboard?.writeText === 'function'
}

/**
 * Writes text to the system clipboard.
 *
 * Returns:
 *  - `true` on success.
 *  - `false` when the API is unsupported or the user has denied permission.
 */
export async function writeClipboardText(text: string): Promise<boolean> {
  if (!isClipboardWriteSupported()) return false
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
