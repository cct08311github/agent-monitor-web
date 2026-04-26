// ---------------------------------------------------------------------------
// notifyPromptState — lightweight persistence for the desktop-notify gentle
// prompt banner.
//
// Stores a single flag in localStorage (`oc_notify_prompt_shown = '1'`) so we
// know not to show the banner again once the user has made a choice.
// "之後再問" (Later) intentionally does NOT set the flag, so the prompt will
// reappear in the next session.
// ---------------------------------------------------------------------------

import { getPermission } from './desktopNotify'

const KEY = 'oc_notify_prompt_shown'

/** Returns true when the user has already seen and dismissed the prompt. */
export function isPromptShown(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

/** Marks the prompt as shown so it won't appear again this browser profile. */
export function markShown(): void {
  try {
    localStorage.setItem(KEY, '1')
  } catch {
    /* silent — storage unavailable */
  }
}

/** Clears the shown flag (useful for testing / dev reset). */
export function resetShown(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* silent */
  }
}

/**
 * Returns true when all three conditions for showing the banner are met:
 *   1. The browser Notification permission is still "default" (not yet decided)
 *   2. The user has not previously dismissed this prompt
 */
export function shouldShowPrompt(): boolean {
  return getPermission() === 'default' && !isPromptShown()
}
