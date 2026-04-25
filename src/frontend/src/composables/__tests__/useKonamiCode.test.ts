import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { useKonamiCode } from '../useKonamiCode'

// ---------------------------------------------------------------------------
// useKonamiCode unit tests
//
// Strategy: mount a dummy component that uses the composable so that
// onMounted / onUnmounted lifecycle hooks fire properly.
// ---------------------------------------------------------------------------

const KONAMI_SEQUENCE = [
  'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
  'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight',
  'b', 'a',
]

/** Fire a keydown sequence on document (no special target). */
function fireKeys(keys: string[]) {
  for (const key of keys) {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  }
}

/** Fire keys simulating a specific element tagName as the event target. */
function fireKeysWithTarget(keys: string[], tagName: string) {
  for (const key of keys) {
    const el = document.createElement(tagName.toLowerCase())
    const event = new KeyboardEvent('keydown', { key, bubbles: true })
    Object.defineProperty(event, 'target', { value: el, writable: false })
    document.dispatchEvent(event)
  }
}

// ---------------------------------------------------------------------------

describe('useKonamiCode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── 1. Full sequence fires callback ─────────────────────────────────────────

  it('fires callback when full Konami sequence is entered', () => {
    const onMatch = vi.fn()

    const Comp = defineComponent({
      setup() { useKonamiCode(onMatch) },
      template: '<div />',
    })

    const wrapper = mount(Comp)
    fireKeys(KONAMI_SEQUENCE)

    expect(onMatch).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  // ── 2. Partial sequence does not fire ───────────────────────────────────────

  it('does not fire callback on partial sequence', () => {
    const onMatch = vi.fn()

    const Comp = defineComponent({
      setup() { useKonamiCode(onMatch) },
      template: '<div />',
    })

    const wrapper = mount(Comp)
    fireKeys(KONAMI_SEQUENCE.slice(0, 5)) // only first 5 keys

    expect(onMatch).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  // ── 3. Wrong sequence does not fire ─────────────────────────────────────────

  it('does not fire callback on wrong sequence', () => {
    const onMatch = vi.fn()

    const Comp = defineComponent({
      setup() { useKonamiCode(onMatch) },
      template: '<div />',
    })

    const wrapper = mount(Comp)
    // Enter wrong keys (same length but wrong order)
    fireKeys(['ArrowDown', 'ArrowDown', 'ArrowUp', 'ArrowUp',
      'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'])

    expect(onMatch).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  // ── 4. INPUT focused — keys ignored ─────────────────────────────────────────

  it('ignores keys when an INPUT element is focused', () => {
    const onMatch = vi.fn()

    const Comp = defineComponent({
      setup() { useKonamiCode(onMatch) },
      template: '<div />',
    })

    const wrapper = mount(Comp)
    fireKeysWithTarget(KONAMI_SEQUENCE, 'INPUT')

    expect(onMatch).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  // ── 5. TEXTAREA focused — keys ignored ──────────────────────────────────────

  it('ignores keys when a TEXTAREA element is focused', () => {
    const onMatch = vi.fn()

    const Comp = defineComponent({
      setup() { useKonamiCode(onMatch) },
      template: '<div />',
    })

    const wrapper = mount(Comp)
    fireKeysWithTarget(KONAMI_SEQUENCE, 'TEXTAREA')

    expect(onMatch).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  // ── 6. SELECT focused — keys ignored ────────────────────────────────────────

  it('ignores keys when a SELECT element is focused', () => {
    const onMatch = vi.fn()

    const Comp = defineComponent({
      setup() { useKonamiCode(onMatch) },
      template: '<div />',
    })

    const wrapper = mount(Comp)
    fireKeysWithTarget(KONAMI_SEQUENCE, 'SELECT')

    expect(onMatch).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  // ── 7. Cleanup on unmount ────────────────────────────────────────────────────

  it('removes keydown listener after component unmounts', () => {
    const onMatch = vi.fn()

    const Comp = defineComponent({
      setup() { useKonamiCode(onMatch) },
      template: '<div />',
    })

    const wrapper = mount(Comp)
    wrapper.unmount() // remove listener

    // Firing keys after unmount should NOT trigger callback
    fireKeys(KONAMI_SEQUENCE)

    expect(onMatch).not.toHaveBeenCalled()
  })

  // ── 8. Case-insensitive 'B' and 'A' (uppercase) ──────────────────────────────

  it('matches case-insensitively for B and A keys', () => {
    const onMatch = vi.fn()

    const Comp = defineComponent({
      setup() { useKonamiCode(onMatch) },
      template: '<div />',
    })

    const wrapper = mount(Comp)
    // Use uppercase B and A — should still match
    const upperCaseSequence = [
      'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
      'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight',
      'B', 'A', // uppercase
    ]
    fireKeys(upperCaseSequence)

    expect(onMatch).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  // ── 9. Extra keys before sequence still match (buffer slice) ─────────────────

  it('matches sequence even when extra keys are typed before it', () => {
    const onMatch = vi.fn()

    const Comp = defineComponent({
      setup() { useKonamiCode(onMatch) },
      template: '<div />',
    })

    const wrapper = mount(Comp)
    // Type some random keys first, then the full Konami sequence
    const extraKeys = ['x', 'y', 'z', 'Enter', 'Tab']
    fireKeys([...extraKeys, ...KONAMI_SEQUENCE])

    expect(onMatch).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  // ── 10. Multiple successive matches ─────────────────────────────────────────

  it('fires callback multiple times for repeated sequences', () => {
    const onMatch = vi.fn()

    const Comp = defineComponent({
      setup() { useKonamiCode(onMatch) },
      template: '<div />',
    })

    const wrapper = mount(Comp)
    fireKeys(KONAMI_SEQUENCE)
    fireKeys(KONAMI_SEQUENCE)

    expect(onMatch).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })
})
