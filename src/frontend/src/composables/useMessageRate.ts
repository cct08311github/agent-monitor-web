// ---------------------------------------------------------------------------
// useMessageRate — tracks SSE message throughput over a 60-second sliding window
//
// Module-scoped state: a circular buffer of 60 second-buckets, advanced by
// a 1-second setInterval. Call recordMessage() from SSE onMessage handlers to
// count events; call installMessageRateTicker() once at app startup (idempotent).
// ---------------------------------------------------------------------------

import { ref, computed, type ComputedRef } from 'vue'

const WINDOW_SIZE = 60

const buckets = ref<number[]>(new Array(WINDOW_SIZE).fill(0))
const head = ref(0)  // index of the CURRENT second's bucket (being incremented)
const tick = ref(0)  // rolling counter incremented on every data change for reactivity

let intervalId: ReturnType<typeof setInterval> | null = null

/** Advance head by 1 and zero the new bucket (called every second). */
function rotate(): void {
  head.value = (head.value + 1) % WINDOW_SIZE
  buckets.value[head.value] = 0
  tick.value++
}

/** Call this from the SSE onMessage handler to count n incoming messages. */
export function recordMessage(n = 1): void {
  buckets.value[head.value] += n
  tick.value++
}

export interface MessageRateApi {
  buckets: ComputedRef<ReadonlyArray<number>>
  /** Oldest bucket at index 0, most-recent bucket at last index. */
  orderedBuckets: ComputedRef<ReadonlyArray<number>>
  avgPerSec: ComputedRef<number>
  peakPerSec: ComputedRef<number>
  totalLast60s: ComputedRef<number>
}

export function useMessageRate(): MessageRateApi {
  return {
    buckets: computed(() => {
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      tick.value
      return buckets.value.slice()
    }),
    orderedBuckets: computed(() => {
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      tick.value
      // Start from (head + 1) mod size — the oldest bucket, walk forward
      const out: number[] = []
      for (let i = 1; i <= WINDOW_SIZE; i++) {
        out.push(buckets.value[(head.value + i) % WINDOW_SIZE])
      }
      return out
    }),
    avgPerSec: computed(() => {
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      tick.value
      const sum = buckets.value.reduce((a, b) => a + b, 0)
      return sum / WINDOW_SIZE
    }),
    peakPerSec: computed(() => {
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      tick.value
      return Math.max(...buckets.value)
    }),
    totalLast60s: computed(() => {
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      tick.value
      return buckets.value.reduce((a, b) => a + b, 0)
    }),
  }
}

/** Start the 1-second rotation ticker. Idempotent — safe to call multiple times. */
export function installMessageRateTicker(): void {
  if (intervalId !== null) return
  if (typeof window === 'undefined') return
  intervalId = setInterval(rotate, 1000)
}

/** Stop the rotation ticker (call in onUnmounted / test teardown). */
export function teardownMessageRateTicker(): void {
  if (intervalId !== null) {
    clearInterval(intervalId)
    intervalId = null
  }
}

/** Reset all module-level state — for tests only. */
export function _resetMessageRate(): void {
  buckets.value = new Array(WINDOW_SIZE).fill(0)
  head.value = 0
  tick.value = 0
}
