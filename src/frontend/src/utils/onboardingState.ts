// ---------------------------------------------------------------------------
// onboardingState.ts — localStorage persistence for onboarding completion flag.
// ---------------------------------------------------------------------------

const KEY = 'oc_onboarding_completed'

export function isCompleted(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function markCompleted(): void {
  try {
    localStorage.setItem(KEY, '1')
  } catch {
    /* silent */
  }
}

export function reset(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* silent */
  }
}
