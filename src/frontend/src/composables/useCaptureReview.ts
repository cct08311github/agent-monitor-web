/**
 * useCaptureReview — module-scoped composable for the weekly Capture review reminder.
 *
 * `isOpen` is module-level so all callers share the same reactive state.
 * Call `maybeOpenWeeklyReminder()` once in App.vue onMounted (with a small
 * delay to let the dashboard settle before showing the banner).
 */

import { ref } from 'vue'
import {
  shouldShowWeeklyReminder,
  markDismissed,
  disableReminder,
} from '@/utils/captureReviewState'

// ---------------------------------------------------------------------------
// Module-scoped shared state
// ---------------------------------------------------------------------------

const isOpen = ref(false)

// ---------------------------------------------------------------------------
// Public composable
// ---------------------------------------------------------------------------

export function useCaptureReview() {
  return {
    isOpen,
    open: (): void => {
      isOpen.value = true
    },
    close: (): void => {
      isOpen.value = false
    },
    dismissThisWeek: (): void => {
      markDismissed()
      isOpen.value = false
    },
    disableForever: (): void => {
      disableReminder()
      markDismissed()
      isOpen.value = false
    },
  }
}

// ---------------------------------------------------------------------------
// Auto-open helper (called from App.vue onMounted)
// ---------------------------------------------------------------------------

/**
 * Open the review banner if the weekly reminder conditions are met.
 * Safe to call unconditionally — all gating is inside shouldShowWeeklyReminder.
 */
export function maybeOpenWeeklyReminder(): void {
  if (shouldShowWeeklyReminder()) {
    isOpen.value = true
  }
}
