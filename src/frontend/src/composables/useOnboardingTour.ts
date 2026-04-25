// ---------------------------------------------------------------------------
// useOnboardingTour — module-scoped state for the 5-step onboarding walkthrough.
//
// Usage:
//   const { isOpen, stepIndex, currentStep, next, prev, skip, restart } = useOnboardingTour()
//   installOnboardingAutoStart()  // call once in App.vue onMounted
//   teardownOnboardingAutoStart() // call in App.vue onUnmounted
// ---------------------------------------------------------------------------

import { ref, computed } from 'vue'
import { ONBOARDING_STEPS } from '@/data/onboardingSteps'
import { isCompleted, markCompleted, reset as resetState } from '@/utils/onboardingState'

// ---------------------------------------------------------------------------
// Module-scoped shared state — one tour instance for the entire app
// ---------------------------------------------------------------------------

const isOpen = ref(false)
const stepIndex = ref(0)

let autoStartTimer: ReturnType<typeof setTimeout> | null = null

// ---------------------------------------------------------------------------
// Composable
// ---------------------------------------------------------------------------

export function useOnboardingTour() {
  const totalSteps = computed(() => ONBOARDING_STEPS.length)
  const currentStep = computed(() => ONBOARDING_STEPS[stepIndex.value])
  const isLast = computed(() => stepIndex.value === ONBOARDING_STEPS.length - 1)
  const isFirst = computed(() => stepIndex.value === 0)

  function open(): void {
    stepIndex.value = 0
    isOpen.value = true
  }

  function close(): void {
    isOpen.value = false
  }

  function next(): void {
    if (isLast.value) {
      complete()
      return
    }
    stepIndex.value += 1
  }

  function prev(): void {
    if (!isFirst.value) {
      stepIndex.value -= 1
    }
  }

  function skip(): void {
    markCompleted()
    close()
  }

  function complete(): void {
    markCompleted()
    close()
  }

  function restart(): void {
    resetState()
    open()
  }

  return {
    isOpen,
    stepIndex,
    totalSteps,
    currentStep,
    isLast,
    isFirst,
    open,
    close,
    next,
    prev,
    skip,
    complete,
    restart,
  }
}

// ---------------------------------------------------------------------------
// Auto-start helpers — call once from App.vue lifecycle hooks
// ---------------------------------------------------------------------------

export function installOnboardingAutoStart(delayMs: number = 1500): void {
  if (typeof window === 'undefined') return
  if (isCompleted()) return
  if (autoStartTimer !== null) return

  autoStartTimer = setTimeout(() => {
    stepIndex.value = 0
    isOpen.value = true
    autoStartTimer = null
  }, delayMs)
}

export function teardownOnboardingAutoStart(): void {
  if (autoStartTimer !== null) {
    clearTimeout(autoStartTimer)
    autoStartTimer = null
  }
}
