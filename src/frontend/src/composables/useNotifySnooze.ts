// ---------------------------------------------------------------------------
// useNotifySnooze — reactive composable for global notification snooze.
//
// Module-scoped refs so all components share the same state.
// A 1-second ticker drives the countdown display; the ticker is reference-
// counted so it starts on first mount and stops when all consumers unmount.
// ---------------------------------------------------------------------------

import { ref, computed, onMounted, onUnmounted } from 'vue'
import {
  loadSnoozedUntil,
  setSnoozedUntil,
  snoozeFor as snoozeUtil,
  clearSnooze as clearUtil,
} from '@/utils/notifySnooze'

// ---------------------------------------------------------------------------
// Module-scoped shared state
// ---------------------------------------------------------------------------

const snoozedUntil = ref<number | null>(loadSnoozedUntil())
const tick = ref<number>(Date.now())

let tickerId: ReturnType<typeof setInterval> | null = null
let consumers = 0

function installTicker(): void {
  if (tickerId !== null) return
  tickerId = setInterval(() => {
    tick.value = Date.now()
    // Auto-clear expired snooze so reactivity propagates
    if (snoozedUntil.value !== null && snoozedUntil.value <= tick.value) {
      snoozedUntil.value = null
    }
  }, 1_000)
}

function teardownTicker(): void {
  if (tickerId === null) return
  clearInterval(tickerId)
  tickerId = null
}

// ---------------------------------------------------------------------------
// Public composable
// ---------------------------------------------------------------------------

export function useNotifySnooze() {
  onMounted(() => {
    consumers++
    installTicker()
  })

  onUnmounted(() => {
    consumers--
    if (consumers === 0) teardownTicker()
  })

  const isSnoozed = computed(
    () => snoozedUntil.value !== null && snoozedUntil.value > tick.value,
  )

  const remainingMs = computed(() =>
    isSnoozed.value && snoozedUntil.value !== null
      ? Math.max(0, snoozedUntil.value - tick.value)
      : 0,
  )

  function snooze(ms: number): void {
    const expiresAt = snoozeUtil(ms)
    snoozedUntil.value = expiresAt
  }

  function cancel(): void {
    clearUtil()
    snoozedUntil.value = null
  }

  return {
    /** Reactive — true while snooze is active. */
    isSnoozed,
    /** Remaining snooze duration in ms (0 when not snoozed). */
    remainingMs,
    /** Start a new snooze for `ms` milliseconds. */
    snooze,
    /** Cancel snooze immediately. */
    cancel,
  }
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** @internal — resets module-scoped state. For tests only. */
export function _resetNotifySnoozeState(): void {
  teardownTicker()
  consumers = 0
  snoozedUntil.value = loadSnoozedUntil()
  tick.value = Date.now()
}

/** @internal — force-sets snoozedUntil ref without touching localStorage. For tests only. */
export function _setSnoozedUntilRef(ts: number | null): void {
  snoozedUntil.value = ts
  setSnoozedUntil(ts)
}
