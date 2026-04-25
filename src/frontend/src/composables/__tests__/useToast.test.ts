import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useToast } from '../useToast'

// Reset module-scoped queue state between tests by importing the clear function
// and calling it in beforeEach.

describe('useToast', () => {
  let toast: ReturnType<typeof useToast>

  beforeEach(() => {
    vi.useFakeTimers()
    toast = useToast()
    // Start each test with a clean queue
    toast.clear()
  })

  afterEach(() => {
    toast.clear()
    vi.useRealTimers()
  })

  // ---------------------------------------------------------------------------
  // show() basics
  // ---------------------------------------------------------------------------

  it('show() adds entry to queue and returns an id', () => {
    const id = toast.show({ variant: 'info', message: 'Hello' })
    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(0)
    expect(toast.queue.value).toHaveLength(1)
    expect(toast.queue.value[0].message).toBe('Hello')
    expect(toast.queue.value[0].variant).toBe('info')
  })

  it('show() stores the correct variant', () => {
    toast.show({ variant: 'warning', message: 'Watch out' })
    expect(toast.queue.value[0].variant).toBe('warning')
  })

  it('show() sets createdAt to a recent timestamp', () => {
    const before = Date.now()
    toast.show({ variant: 'info', message: 'ts check' })
    const after = Date.now()
    const entry = toast.queue.value[0]
    expect(entry.createdAt).toBeGreaterThanOrEqual(before)
    expect(entry.createdAt).toBeLessThanOrEqual(after)
  })

  // ---------------------------------------------------------------------------
  // dismiss()
  // ---------------------------------------------------------------------------

  it('dismiss(id) removes the entry from the queue', () => {
    const id = toast.show({ variant: 'success', message: 'To dismiss' })
    expect(toast.queue.value).toHaveLength(1)
    toast.dismiss(id)
    expect(toast.queue.value).toHaveLength(0)
  })

  it('dismiss() with unknown id does nothing', () => {
    toast.show({ variant: 'info', message: 'Alive' })
    toast.dismiss('non-existent-id')
    expect(toast.queue.value).toHaveLength(1)
  })

  // ---------------------------------------------------------------------------
  // clear()
  // ---------------------------------------------------------------------------

  it('clear() removes all entries', () => {
    toast.show({ variant: 'info', message: 'A' })
    toast.show({ variant: 'success', message: 'B' })
    toast.show({ variant: 'error', message: 'C' })
    expect(toast.queue.value).toHaveLength(3)
    toast.clear()
    expect(toast.queue.value).toHaveLength(0)
  })

  it('clear() cancels all pending auto-dismiss timers (no timer fires after clear)', () => {
    toast.show({ variant: 'info', message: 'Timer', duration: 3000 })
    toast.clear()
    // No error should be thrown; queue remains empty after advancing time
    vi.advanceTimersByTime(5000)
    expect(toast.queue.value).toHaveLength(0)
  })

  // ---------------------------------------------------------------------------
  // Auto-dismiss
  // ---------------------------------------------------------------------------

  it('entry is auto-dismissed after the specified duration', () => {
    toast.show({ variant: 'success', message: 'Bye', duration: 3000 })
    expect(toast.queue.value).toHaveLength(1)
    vi.advanceTimersByTime(2999)
    expect(toast.queue.value).toHaveLength(1) // still present
    vi.advanceTimersByTime(1)
    expect(toast.queue.value).toHaveLength(0) // dismissed
  })

  it('duration:0 prevents auto-dismiss (sticky)', () => {
    toast.show({ variant: 'warning', message: 'Sticky', duration: 0 })
    vi.advanceTimersByTime(60_000)
    expect(toast.queue.value).toHaveLength(1) // still present after 60 s
  })

  // ---------------------------------------------------------------------------
  // Queue cap (max 5)
  // ---------------------------------------------------------------------------

  it('adding a 6th toast removes the oldest entry', () => {
    for (let i = 1; i <= 5; i++) {
      toast.show({ variant: 'info', message: `Toast ${i}` })
    }
    expect(toast.queue.value).toHaveLength(5)
    const firstId = toast.queue.value[0].id
    toast.show({ variant: 'info', message: 'Toast 6' })
    expect(toast.queue.value).toHaveLength(5)
    const ids = toast.queue.value.map((t) => t.id)
    expect(ids).not.toContain(firstId)
    expect(toast.queue.value[4].message).toBe('Toast 6')
  })

  it('the oldest toast is evicted when the queue overflows (not the newest)', () => {
    const ids: string[] = []
    for (let i = 0; i < 5; i++) {
      ids.push(toast.show({ variant: 'info', message: `T${i}` }))
    }
    // Evict ids[0]
    toast.show({ variant: 'info', message: 'Overflow' })
    const remaining = toast.queue.value.map((t) => t.id)
    expect(remaining).not.toContain(ids[0])
    expect(remaining).toContain(ids[1])
    expect(remaining).toContain(ids[4])
  })

  // ---------------------------------------------------------------------------
  // actionLabel + onAction
  // ---------------------------------------------------------------------------

  it('actionLabel and onAction are stored on the entry', () => {
    const fn = vi.fn()
    toast.show({ variant: 'info', message: 'Action toast', actionLabel: '重試', onAction: fn })
    const entry = toast.queue.value[0]
    expect(entry.actionLabel).toBe('重試')
    expect(entry.onAction).toBe(fn)
  })

  it('onAction callback can be invoked from the entry', () => {
    const fn = vi.fn()
    toast.show({ variant: 'warning', message: 'Action', onAction: fn })
    toast.queue.value[0].onAction?.()
    expect(fn).toHaveBeenCalledTimes(1)
  })

  // ---------------------------------------------------------------------------
  // Variant helpers
  // ---------------------------------------------------------------------------

  it('success() creates an entry with variant "success"', () => {
    toast.success('All good')
    expect(toast.queue.value[0].variant).toBe('success')
    expect(toast.queue.value[0].message).toBe('All good')
  })

  it('info() creates an entry with variant "info"', () => {
    toast.info('FYI')
    expect(toast.queue.value[0].variant).toBe('info')
  })

  it('warning() creates an entry with variant "warning"', () => {
    toast.warning('Be careful')
    expect(toast.queue.value[0].variant).toBe('warning')
  })

  it('error() creates an entry with variant "error"', () => {
    toast.error('Something broke')
    expect(toast.queue.value[0].variant).toBe('error')
  })

  it('each helper returns an id string', () => {
    expect(typeof toast.success('s')).toBe('string')
    expect(typeof toast.info('i')).toBe('string')
    expect(typeof toast.warning('w')).toBe('string')
    expect(typeof toast.error('e')).toBe('string')
  })

  // ---------------------------------------------------------------------------
  // Timer cleanup on manual dismiss
  // ---------------------------------------------------------------------------

  it('dismissing a toast before auto-dismiss prevents the timer from firing again', () => {
    const id = toast.show({ variant: 'info', message: 'Race', duration: 2000 })
    toast.dismiss(id)
    expect(toast.queue.value).toHaveLength(0)
    // Advancing timer should not cause any side-effects
    vi.advanceTimersByTime(3000)
    expect(toast.queue.value).toHaveLength(0)
  })

  // ---------------------------------------------------------------------------
  // Default duration
  // ---------------------------------------------------------------------------

  it('default duration is 5000ms when not specified', () => {
    toast.show({ variant: 'info', message: 'Default dur' })
    expect(toast.queue.value).toHaveLength(1)
    vi.advanceTimersByTime(4999)
    expect(toast.queue.value).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(toast.queue.value).toHaveLength(0)
  })

  // ---------------------------------------------------------------------------
  // Shared state across multiple useToast() calls
  // ---------------------------------------------------------------------------

  it('multiple useToast() calls share the same queue', () => {
    const toast2 = useToast()
    toast.success('From toast1')
    expect(toast2.queue.value).toHaveLength(1)
    toast2.success('From toast2')
    expect(toast.queue.value).toHaveLength(2)
  })
})
