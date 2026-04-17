import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createDebouncer } from './debounce'

describe('createDebouncer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('fires callback after delay elapses', () => {
    const cb = vi.fn()
    const debounced = createDebouncer(cb, 200)
    debounced('hello')
    expect(cb).not.toHaveBeenCalled()
    vi.advanceTimersByTime(199)
    expect(cb).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(cb).toHaveBeenCalledWith('hello')
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('coalesces rapid calls into one invocation with the latest value', () => {
    const cb = vi.fn()
    const debounced = createDebouncer(cb, 200)
    debounced('a')
    vi.advanceTimersByTime(100)
    debounced('b')
    vi.advanceTimersByTime(100)
    debounced('c')
    expect(cb).not.toHaveBeenCalled()
    vi.advanceTimersByTime(200)
    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb).toHaveBeenCalledWith('c')
  })

  it('separates distinct bursts that exceed the delay window', () => {
    const cb = vi.fn()
    const debounced = createDebouncer(cb, 200)
    debounced('first')
    vi.advanceTimersByTime(200)
    expect(cb).toHaveBeenCalledWith('first')
    debounced('second')
    vi.advanceTimersByTime(200)
    expect(cb).toHaveBeenCalledWith('second')
    expect(cb).toHaveBeenCalledTimes(2)
  })

  it('cancel() aborts pending invocation', () => {
    const cb = vi.fn()
    const debounced = createDebouncer(cb, 200)
    debounced('pending')
    vi.advanceTimersByTime(100)
    debounced.cancel()
    vi.advanceTimersByTime(500)
    expect(cb).not.toHaveBeenCalled()
  })

  it('cancel() is safe to call when no timer is pending', () => {
    const cb = vi.fn()
    const debounced = createDebouncer(cb, 200)
    debounced.cancel()
    debounced.cancel()
    debounced('x')
    vi.advanceTimersByTime(200)
    expect(cb).toHaveBeenCalledWith('x')
  })

  it('typed generic carries through', () => {
    const cb = vi.fn<(n: number) => void>()
    const debounced = createDebouncer<number>(cb, 100)
    debounced(42)
    vi.advanceTimersByTime(100)
    expect(cb).toHaveBeenCalledWith(42)
  })
})
