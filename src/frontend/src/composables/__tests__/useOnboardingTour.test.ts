import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import {
  useOnboardingTour,
  installOnboardingAutoStart,
  teardownOnboardingAutoStart,
} from '../useOnboardingTour'
import { reset as resetState, markCompleted } from '@/utils/onboardingState'
import { ONBOARDING_STEPS } from '@/data/onboardingSteps'

function makeLocalStorageStub(seed: Record<string, string> = {}): Storage {
  const store: Record<string, string> = { ...seed }
  return {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => {
      store[k] = String(v)
    },
    removeItem: (k: string) => {
      delete store[k]
    },
    clear: () => {
      for (const k of Object.keys(store)) delete store[k]
    },
    key: (i: number) => Object.keys(store)[i] ?? null,
    get length() {
      return Object.keys(store).length
    },
  } as Storage
}

// Helper: reset module-scoped state between tests
function resetTourState(): void {
  const tour = useOnboardingTour()
  tour.isOpen.value = false
  tour.stepIndex.value = 0
  resetState()
  teardownOnboardingAutoStart()
}

describe('useOnboardingTour', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('localStorage', makeLocalStorageStub())
    resetTourState()
  })

  afterEach(() => {
    teardownOnboardingAutoStart()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  // ---------------------------------------------------------------------------
  // Basic navigation
  // ---------------------------------------------------------------------------

  it('stepIndex starts at 0 and currentStep is the first step', () => {
    const { stepIndex, currentStep } = useOnboardingTour()
    expect(stepIndex.value).toBe(0)
    expect(currentStep.value).toEqual(ONBOARDING_STEPS[0])
  })

  it('next() increments stepIndex', () => {
    const { stepIndex, next } = useOnboardingTour()
    next()
    expect(stepIndex.value).toBe(1)
  })

  it('prev() decrements stepIndex when not on first step', () => {
    const { stepIndex, next, prev } = useOnboardingTour()
    next()
    expect(stepIndex.value).toBe(1)
    prev()
    expect(stepIndex.value).toBe(0)
  })

  it('prev() does nothing when already on first step', () => {
    const { stepIndex, prev, isFirst } = useOnboardingTour()
    expect(isFirst.value).toBe(true)
    prev()
    expect(stepIndex.value).toBe(0)
  })

  // ---------------------------------------------------------------------------
  // Last step behaviour
  // ---------------------------------------------------------------------------

  it('next() on the last step calls complete — closes + persists completed', () => {
    const { stepIndex, isOpen, next } = useOnboardingTour()
    isOpen.value = true
    stepIndex.value = ONBOARDING_STEPS.length - 1

    next() // triggers complete()

    expect(isOpen.value).toBe(false)
    expect(localStorage.getItem('oc_onboarding_completed')).toBe('1')
  })

  it('isLast is true only on the final step', () => {
    const { stepIndex, isLast } = useOnboardingTour()
    expect(isLast.value).toBe(false)
    stepIndex.value = ONBOARDING_STEPS.length - 1
    expect(isLast.value).toBe(true)
  })

  // ---------------------------------------------------------------------------
  // skip / complete
  // ---------------------------------------------------------------------------

  it('skip() closes the tour and persists completed', () => {
    const { isOpen, skip } = useOnboardingTour()
    isOpen.value = true
    skip()
    expect(isOpen.value).toBe(false)
    expect(localStorage.getItem('oc_onboarding_completed')).toBe('1')
  })

  it('complete() closes the tour and persists completed', () => {
    const { isOpen, complete } = useOnboardingTour()
    isOpen.value = true
    complete()
    expect(isOpen.value).toBe(false)
    expect(localStorage.getItem('oc_onboarding_completed')).toBe('1')
  })

  // ---------------------------------------------------------------------------
  // restart
  // ---------------------------------------------------------------------------

  it('restart() resets state, opens at step 0, and clears the completed flag', () => {
    const { isOpen, stepIndex, restart } = useOnboardingTour()
    markCompleted()
    stepIndex.value = 3
    isOpen.value = false

    restart()

    expect(isOpen.value).toBe(true)
    expect(stepIndex.value).toBe(0)
    expect(localStorage.getItem('oc_onboarding_completed')).toBeNull()
  })

  // ---------------------------------------------------------------------------
  // installOnboardingAutoStart
  // ---------------------------------------------------------------------------

  it('installOnboardingAutoStart opens the tour after the delay when not completed', () => {
    const { isOpen } = useOnboardingTour()
    expect(isOpen.value).toBe(false)

    installOnboardingAutoStart(1500)
    vi.advanceTimersByTime(1499)
    expect(isOpen.value).toBe(false)

    vi.advanceTimersByTime(1)
    expect(isOpen.value).toBe(true)
  })

  it('installOnboardingAutoStart does NOT open the tour when already completed', () => {
    markCompleted()
    const { isOpen } = useOnboardingTour()

    installOnboardingAutoStart(1500)
    vi.advanceTimersByTime(2000)

    expect(isOpen.value).toBe(false)
  })

  it('teardownOnboardingAutoStart cancels the pending timer', () => {
    const { isOpen } = useOnboardingTour()
    installOnboardingAutoStart(1500)
    teardownOnboardingAutoStart()
    vi.advanceTimersByTime(2000)
    expect(isOpen.value).toBe(false)
  })

  // ---------------------------------------------------------------------------
  // totalSteps / open / close
  // ---------------------------------------------------------------------------

  it('totalSteps matches ONBOARDING_STEPS length', () => {
    const { totalSteps } = useOnboardingTour()
    expect(totalSteps.value).toBe(ONBOARDING_STEPS.length)
  })

  it('open() sets isOpen to true and resets to step 0', () => {
    const { isOpen, stepIndex, open } = useOnboardingTour()
    stepIndex.value = 3
    open()
    expect(isOpen.value).toBe(true)
    expect(stepIndex.value).toBe(0)
  })

  it('close() sets isOpen to false', () => {
    const { isOpen, open, close } = useOnboardingTour()
    open()
    close()
    expect(isOpen.value).toBe(false)
  })
})
