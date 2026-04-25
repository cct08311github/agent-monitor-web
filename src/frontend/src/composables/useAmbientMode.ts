import { ref, computed, onUnmounted, watch } from 'vue'

const STORAGE_KEY = 'oc_ambient_mode'
const PAUSE_AFTER_INTERACTION_MS = 30_000
const DEFAULT_INTERVAL_MS = 8_000

// ---------------------------------------------------------------------------
// Module-scope singleton state — multiple useAmbientMode() calls share it
// ---------------------------------------------------------------------------

const enabled = ref<boolean>(false)
const intervalMs = ref<number>(DEFAULT_INTERVAL_MS)
const currentIndex = ref<number>(0)
const pausedUntil = ref<number>(0)

let cycleId: ReturnType<typeof setInterval> | null = null
let interactionHandler: ((e: Event) => void) | null = null

// Restore persisted toggle state
try {
  if (typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY) === '1') {
    enabled.value = true
  }
} catch {
  /* silent — private browsing or storage unavailable */
}

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, enabled.value ? '1' : '0')
  } catch {
    /* silent */
  }
}

// ---------------------------------------------------------------------------
// Public composable
// ---------------------------------------------------------------------------

export interface AmbientModeOpts {
  getAgentIds: () => string[]
  onCycle: (agentId: string) => void
}

export function useAmbientMode(opts: AmbientModeOpts) {
  function tick(): void {
    if (Date.now() < pausedUntil.value) return
    const ids = opts.getAgentIds()
    if (ids.length === 0) return
    currentIndex.value = (currentIndex.value + 1) % ids.length
    opts.onCycle(ids[currentIndex.value])
  }

  function bumpInteraction(): void {
    pausedUntil.value = Date.now() + PAUSE_AFTER_INTERACTION_MS
  }

  function start(): void {
    if (cycleId) return
    cycleId = setInterval(tick, intervalMs.value)
    interactionHandler = () => bumpInteraction()
    document.addEventListener('mousemove', interactionHandler)
    document.addEventListener('keydown', interactionHandler)
  }

  function stop(): void {
    if (cycleId) {
      clearInterval(cycleId)
      cycleId = null
    }
    if (interactionHandler) {
      document.removeEventListener('mousemove', interactionHandler)
      document.removeEventListener('keydown', interactionHandler)
      interactionHandler = null
    }
  }

  function toggle(): void {
    enabled.value = !enabled.value
  }

  function setIntervalMs(ms: number): void {
    intervalMs.value = ms
    if (cycleId) {
      stop()
      start()
    }
  }

  // React to enabled changes and persist
  watch(
    enabled,
    (on) => {
      persist()
      if (on) start()
      else stop()
    },
    { immediate: true },
  )

  onUnmounted(() => stop())

  const isPaused = computed(() => Date.now() < pausedUntil.value)

  return {
    enabled,
    intervalMs,
    currentIndex,
    isPaused,
    toggle,
    setIntervalMs,
    bumpInteraction,
  }
}
