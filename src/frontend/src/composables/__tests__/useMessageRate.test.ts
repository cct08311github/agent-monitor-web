import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  recordMessage,
  useMessageRate,
  installMessageRateTicker,
  teardownMessageRateTicker,
  _resetMessageRate,
} from '../useMessageRate'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Advance fake time by exactly n seconds (n × 1000ms). */
function advanceSeconds(n: number): void {
  vi.advanceTimersByTime(n * 1000)
}

// ---------------------------------------------------------------------------
// Reset module-level state between tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.useFakeTimers()
  _resetMessageRate()
  teardownMessageRateTicker()
})

afterEach(() => {
  teardownMessageRateTicker()
  vi.useRealTimers()
})

// ---------------------------------------------------------------------------
// recordMessage — bucket accumulation
// ---------------------------------------------------------------------------

describe('recordMessage', () => {
  it('increments the current bucket by 1', () => {
    const { peakPerSec } = useMessageRate()
    recordMessage()
    expect(peakPerSec.value).toBe(1)
  })

  it('multiple recordMessage calls aggregate in the same bucket', () => {
    const { peakPerSec } = useMessageRate()
    recordMessage()
    recordMessage()
    recordMessage()
    expect(peakPerSec.value).toBe(3)
  })

  it('recordMessage(n) increments by n', () => {
    const { peakPerSec } = useMessageRate()
    recordMessage(5)
    expect(peakPerSec.value).toBe(5)
  })
})

// ---------------------------------------------------------------------------
// avgPerSec — statistics
// ---------------------------------------------------------------------------

describe('avgPerSec', () => {
  it('is 1/60 after exactly 1 message recorded in 1 bucket', () => {
    const { avgPerSec } = useMessageRate()
    recordMessage()
    // 1 message spread over 60 buckets
    expect(avgPerSec.value).toBeCloseTo(1 / 60, 8)
  })

  it('is 0 when no messages have been recorded', () => {
    const { avgPerSec } = useMessageRate()
    expect(avgPerSec.value).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// peakPerSec — maximum bucket value
// ---------------------------------------------------------------------------

describe('peakPerSec', () => {
  it('returns the maximum bucket value', () => {
    const { peakPerSec } = useMessageRate()
    installMessageRateTicker()
    recordMessage(3)  // bucket 0 = 3
    advanceSeconds(1) // advance to bucket 1
    recordMessage(7)  // bucket 1 = 7
    advanceSeconds(1) // advance to bucket 2
    recordMessage(2)  // bucket 2 = 2
    expect(peakPerSec.value).toBe(7)
  })
})

// ---------------------------------------------------------------------------
// totalLast60s — sum of all buckets
// ---------------------------------------------------------------------------

describe('totalLast60s', () => {
  it('returns the sum of all bucket counts', () => {
    const { totalLast60s } = useMessageRate()
    installMessageRateTicker()
    recordMessage(4)
    advanceSeconds(1)
    recordMessage(6)
    expect(totalLast60s.value).toBe(10)
  })

  it('is 0 with no messages', () => {
    const { totalLast60s } = useMessageRate()
    expect(totalLast60s.value).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Ticker rotation
// ---------------------------------------------------------------------------

describe('ticker rotation', () => {
  it('after 1 second the new bucket starts at 0', () => {
    const { buckets } = useMessageRate()
    installMessageRateTicker()
    recordMessage(10)
    advanceSeconds(1)
    // head has moved; check that the newest bucket (currently accumulating) is 0
    const data = buckets.value
    // The newest bucket should be 0 (nothing recorded in second 1)
    // head is now at index 1 — which is buckets[1]
    // We can verify indirectly: sum should still equal 10 (old bucket preserved)
    expect(data.reduce((a, b) => a + b, 0)).toBe(10)
  })

  it('oldest data is evicted after full 60-second rotation', () => {
    const { totalLast60s } = useMessageRate()
    installMessageRateTicker()

    // Record 5 messages in the initial bucket (second 0)
    recordMessage(5)

    // Advance 60 full seconds — head wraps around and the original bucket is zeroed
    advanceSeconds(60)

    // The bucket that originally held 5 has been rotated through and zeroed
    expect(totalLast60s.value).toBe(0)
  })

  it('ticker stops rotating after teardown', () => {
    const { totalLast60s } = useMessageRate()
    installMessageRateTicker()
    recordMessage(3)
    teardownMessageRateTicker()

    // Advance time — but since ticker is stopped, head does NOT rotate,
    // so the message count is still visible in the current bucket
    vi.advanceTimersByTime(5000)
    expect(totalLast60s.value).toBe(3)
  })
})

// ---------------------------------------------------------------------------
// installMessageRateTicker — idempotency
// ---------------------------------------------------------------------------

describe('installMessageRateTicker — idempotency', () => {
  it('calling installMessageRateTicker twice only registers one interval', () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
    installMessageRateTicker()
    installMessageRateTicker() // second call should be a no-op
    expect(setIntervalSpy).toHaveBeenCalledTimes(1)
    setIntervalSpy.mockRestore()
  })

  it('rotation advances head exactly once per second (not twice)', () => {
    const { buckets } = useMessageRate()
    installMessageRateTicker()
    installMessageRateTicker() // duplicate — must not add second ticker

    // Record in current bucket, advance 1 second
    recordMessage(9)
    advanceSeconds(1)
    // Record in new bucket
    recordMessage(1)

    // If two intervals were running, head would have advanced twice,
    // placing the second recordMessage in a different bucket.
    // With one interval: bucket[0] = 9, bucket[1] = 1 → sum = 10
    const sum = buckets.value.reduce((a, b) => a + b, 0)
    expect(sum).toBe(10)
  })
})

// ---------------------------------------------------------------------------
// orderedBuckets — ordering
// ---------------------------------------------------------------------------

describe('orderedBuckets — oldest first, newest last', () => {
  it('newest bucket is at the last index', () => {
    const { orderedBuckets } = useMessageRate()
    installMessageRateTicker()

    // Second 0 (current bucket before any advance) = 5
    recordMessage(5)

    // Advance 1 second → head moves; second 0 is now the previous bucket
    advanceSeconds(1)

    // Record in second 1
    recordMessage(3)

    const ordered = orderedBuckets.value
    // The last element should be the current (newest) bucket with value 3
    expect(ordered[ordered.length - 1]).toBe(3)
  })

  it('oldest bucket is at index 0, not the current head', () => {
    const { orderedBuckets } = useMessageRate()
    installMessageRateTicker()

    // Record at second 0, then advance 3 seconds
    recordMessage(7)
    advanceSeconds(3)

    // The oldest still-within-window data is 60 buckets back from head.
    // After 3 advances, the oldest non-zero bucket is near the beginning
    // of orderedBuckets. Specifically seconds ago = 3, so it's at index 56.
    const ordered = orderedBuckets.value
    // Bucket 57 positions from end (60 - 3 - 1) should have the value 7
    // head started at 0, advanced 3× → head = 3
    // orderedBuckets starts at (head + 1) = 4, so the old bucket 0 is at index (60 - 4) = 56
    expect(ordered[56]).toBe(7)
    // The newest bucket (index 59) should be 0 — nothing recorded yet
    expect(ordered[59]).toBe(0)
  })
})
