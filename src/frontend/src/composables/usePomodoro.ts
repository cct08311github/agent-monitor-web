import { ref, computed, onUnmounted } from 'vue'

const FOCUS_SECS = 25 * 60
const BREAK_SECS = 5 * 60

export type Phase = 'idle' | 'focus' | 'break'

const phase = ref<Phase>('idle')
const elapsed = ref<number>(0)
const running = ref<boolean>(false)
let intervalId: ReturnType<typeof setInterval> | null = null

const targetSecs = computed(() => (phase.value === 'break' ? BREAK_SECS : FOCUS_SECS))
const remaining = computed(() => Math.max(0, targetSecs.value - elapsed.value))
const remainingDisplay = computed(() => {
  const r = remaining.value
  const m = Math.floor(r / 60)
  const s = r % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
})

function tick(onComplete?: (nextPhase: Phase) => void): void {
  elapsed.value += 1
  if (elapsed.value >= targetSecs.value) {
    const next: Phase = phase.value === 'focus' ? 'break' : 'focus'
    phase.value = next
    elapsed.value = 0
    onComplete?.(next)
  }
}

export function usePomodoro(onPhaseChange?: (next: Phase) => void) {
  function start() {
    if (running.value) return
    if (phase.value === 'idle') phase.value = 'focus'
    running.value = true
    if (!intervalId) {
      intervalId = setInterval(() => tick(onPhaseChange), 1000)
    }
  }

  function pause() {
    running.value = false
    if (intervalId) {
      clearInterval(intervalId)
      intervalId = null
    }
  }

  function reset() {
    pause()
    phase.value = 'idle'
    elapsed.value = 0
  }

  function toggle() {
    if (running.value) pause()
    else start()
  }

  onUnmounted(() => pause())

  return {
    phase,
    elapsed,
    running,
    remaining,
    remainingDisplay,
    targetSecs,
    start,
    pause,
    reset,
    toggle,
  }
}
