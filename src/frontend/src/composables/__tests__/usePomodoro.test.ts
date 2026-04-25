import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// usePomodoro unit tests
//
// Module-scope state means we need vi.resetModules() before each test to get
// a fresh singleton.  We pair it with vi.useFakeTimers() so interval ticks
// are driven deterministically.
// ---------------------------------------------------------------------------

const FOCUS_SECS = 25 * 60
const BREAK_SECS = 5 * 60

describe('usePomodoro', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.resetModules()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ── 1. Initial state ──────────────────────────────────────────────────────

  it('initialises with phase=idle, elapsed=0, running=false', async () => {
    const { usePomodoro } = await import('../usePomodoro')
    const { phase, elapsed, running } = usePomodoro()

    expect(phase.value).toBe('idle')
    expect(elapsed.value).toBe(0)
    expect(running.value).toBe(false)
  })

  // ── 2. start() transitions to focus and sets running=true ─────────────────

  it('start() sets phase=focus and running=true', async () => {
    const { usePomodoro } = await import('../usePomodoro')
    const { phase, running, start } = usePomodoro()

    start()

    expect(phase.value).toBe('focus')
    expect(running.value).toBe(true)
  })

  // ── 3. elapsed advances when timer ticks ──────────────────────────────────

  it('elapsed increments by 1 per second after start()', async () => {
    const { usePomodoro } = await import('../usePomodoro')
    const { elapsed, start } = usePomodoro()

    start()
    vi.advanceTimersByTime(3000)

    expect(elapsed.value).toBe(3)
  })

  // ── 4. focus phase ends at FOCUS_SECS → switches to break ─────────────────

  it('switches from focus to break when elapsed reaches FOCUS_SECS', async () => {
    const onPhaseChange = vi.fn()
    const { usePomodoro } = await import('../usePomodoro')
    const { phase, elapsed, start } = usePomodoro(onPhaseChange)

    start()
    vi.advanceTimersByTime(FOCUS_SECS * 1000)

    expect(phase.value).toBe('break')
    expect(elapsed.value).toBe(0)
    expect(onPhaseChange).toHaveBeenCalledWith('break')
  })

  // ── 5. break phase ends at BREAK_SECS → switches back to focus ────────────

  it('switches from break back to focus when break elapsed reaches BREAK_SECS', async () => {
    const onPhaseChange = vi.fn()
    const { usePomodoro } = await import('../usePomodoro')
    const { phase, start } = usePomodoro(onPhaseChange)

    start()
    // Advance through full focus phase
    vi.advanceTimersByTime(FOCUS_SECS * 1000)
    expect(phase.value).toBe('break')

    // Advance through full break phase
    vi.advanceTimersByTime(BREAK_SECS * 1000)
    expect(phase.value).toBe('focus')
    expect(onPhaseChange).toHaveBeenLastCalledWith('focus')
  })

  // ── 6. pause() stops the ticker ───────────────────────────────────────────

  it('pause() stops elapsed from advancing', async () => {
    const { usePomodoro } = await import('../usePomodoro')
    const { elapsed, start, pause } = usePomodoro()

    start()
    vi.advanceTimersByTime(2000)
    expect(elapsed.value).toBe(2)

    pause()
    vi.advanceTimersByTime(5000)
    // Elapsed should remain frozen at 2
    expect(elapsed.value).toBe(2)
  })

  it('pause() sets running=false', async () => {
    const { usePomodoro } = await import('../usePomodoro')
    const { running, start, pause } = usePomodoro()

    start()
    expect(running.value).toBe(true)

    pause()
    expect(running.value).toBe(false)
  })

  // ── 7. reset() returns to idle ────────────────────────────────────────────

  it('reset() sets phase=idle, elapsed=0, running=false', async () => {
    const { usePomodoro } = await import('../usePomodoro')
    const { phase, elapsed, running, start, reset } = usePomodoro()

    start()
    vi.advanceTimersByTime(10000)
    reset()

    expect(phase.value).toBe('idle')
    expect(elapsed.value).toBe(0)
    expect(running.value).toBe(false)
  })

  // ── 8. toggle(): start → pause → start ────────────────────────────────────

  it('toggle() starts when idle/paused, pauses when running', async () => {
    const { usePomodoro } = await import('../usePomodoro')
    const { running, toggle } = usePomodoro()

    expect(running.value).toBe(false)
    toggle()
    expect(running.value).toBe(true)

    toggle()
    expect(running.value).toBe(false)

    toggle()
    expect(running.value).toBe(true)
  })

  // ── 9. remainingDisplay formats correctly ─────────────────────────────────

  it('remainingDisplay shows 25:00 when idle', async () => {
    const { usePomodoro } = await import('../usePomodoro')
    const { remainingDisplay } = usePomodoro()

    // phase=idle, so targetSecs=FOCUS_SECS=1500, elapsed=0 → remaining=1500
    expect(remainingDisplay.value).toBe('25:00')
  })

  it('remainingDisplay decrements correctly after ticks', async () => {
    const { usePomodoro } = await import('../usePomodoro')
    const { remainingDisplay, start } = usePomodoro()

    start()
    vi.advanceTimersByTime(65 * 1000) // 65 seconds

    // 1500 - 65 = 1435 → 23:55
    expect(remainingDisplay.value).toBe('23:55')
  })

  // ── 10. calling start() when already running is a no-op ───────────────────

  it('calling start() twice does not reset elapsed', async () => {
    const { usePomodoro } = await import('../usePomodoro')
    const { elapsed, start } = usePomodoro()

    start()
    vi.advanceTimersByTime(3000)
    start() // second call should be a no-op
    vi.advanceTimersByTime(2000)

    expect(elapsed.value).toBe(5)
  })
})
