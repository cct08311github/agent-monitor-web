import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, nextTick } from 'vue'
import { useSSEStatus } from '../useSSEStatus'

// Helper: mount a component to get a composable instance with proper lifecycle
function makeHandle(reconnectCb: () => void) {
  let handle: ReturnType<typeof useSSEStatus> | undefined
  const Comp = defineComponent({
    setup() {
      handle = useSSEStatus(reconnectCb)
    },
    render: () => null,
  })
  const wrapper = mount(Comp)
  return { handle: handle!, wrapper }
}

describe('useSSEStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts in idle state', () => {
    const { handle, wrapper } = makeHandle(() => {})
    expect(handle.status.value).toBe('idle')
    expect(handle.lastHeartbeatAt.value).toBeNull()
    expect(handle.reconnectAttempt.value).toBe(0)
    wrapper.unmount()
  })

  it('markConnected → status becomes connected, reconnectAttempt resets to 0', () => {
    const { handle, wrapper } = makeHandle(() => {})
    handle.markReconnecting(3)
    expect(handle.reconnectAttempt.value).toBe(3)
    handle.markConnected()
    expect(handle.status.value).toBe('connected')
    expect(handle.reconnectAttempt.value).toBe(0)
    wrapper.unmount()
  })

  it('markDisconnected → status becomes disconnected', () => {
    const { handle, wrapper } = makeHandle(() => {})
    handle.markConnected()
    handle.markDisconnected()
    expect(handle.status.value).toBe('disconnected')
    wrapper.unmount()
  })

  it('markReconnecting → status becomes reconnecting, counter increments', () => {
    const { handle, wrapper } = makeHandle(() => {})
    handle.markReconnecting(1)
    expect(handle.status.value).toBe('reconnecting')
    expect(handle.reconnectAttempt.value).toBe(1)
    handle.markReconnecting(2)
    expect(handle.reconnectAttempt.value).toBe(2)
    wrapper.unmount()
  })

  it('state transitions: idle → connected → disconnected → reconnecting → connected', () => {
    const { handle, wrapper } = makeHandle(() => {})

    expect(handle.status.value).toBe('idle')

    handle.markConnected()
    expect(handle.status.value).toBe('connected')

    handle.markDisconnected()
    expect(handle.status.value).toBe('disconnected')

    handle.markReconnecting(1)
    expect(handle.status.value).toBe('reconnecting')
    expect(handle.reconnectAttempt.value).toBe(1)

    handle.markConnected()
    expect(handle.status.value).toBe('connected')
    expect(handle.reconnectAttempt.value).toBe(0)

    wrapper.unmount()
  })

  it('markHeartbeat → updates lastHeartbeatAt and sets status to connected', () => {
    vi.setSystemTime(1_000_000)
    const { handle, wrapper } = makeHandle(() => {})

    handle.markHeartbeat()
    expect(handle.status.value).toBe('connected')
    expect(handle.lastHeartbeatAt.value).toBe(1_000_000)

    wrapper.unmount()
  })

  it('isStale is false at 29 s and true at 31 s', async () => {
    vi.setSystemTime(0)
    const { handle, wrapper } = makeHandle(() => {})

    handle.markHeartbeat()
    expect(handle.isStale.value).toBe(false)

    // Advance 29 s — still within the 30 s window
    vi.advanceTimersByTime(29_000)
    await nextTick()
    expect(handle.isStale.value).toBe(false)

    // Advance 2 more seconds (31 s total) — past the 30 s stale threshold
    vi.advanceTimersByTime(2_000)
    await nextTick()
    expect(handle.isStale.value).toBe(true)

    wrapper.unmount()
  })

  it('isStale remains false when lastHeartbeatAt is null', async () => {
    const { handle, wrapper } = makeHandle(() => {})
    vi.advanceTimersByTime(60_000)
    await nextTick()
    expect(handle.isStale.value).toBe(false)
    wrapper.unmount()
  })

  it('reconnect() calls the provided callback', () => {
    const cb = vi.fn()
    const { handle, wrapper } = makeHandle(cb)
    handle.reconnect()
    expect(cb).toHaveBeenCalledOnce()
    wrapper.unmount()
  })

  it('reconnectAttempt counter increments correctly on successive markReconnecting calls', () => {
    const { handle, wrapper } = makeHandle(() => {})
    handle.markReconnecting(1)
    expect(handle.reconnectAttempt.value).toBe(1)
    handle.markReconnecting(2)
    expect(handle.reconnectAttempt.value).toBe(2)
    handle.markReconnecting(5)
    expect(handle.reconnectAttempt.value).toBe(5)
    wrapper.unmount()
  })
})
