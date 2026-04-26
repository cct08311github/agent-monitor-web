// ---------------------------------------------------------------------------
// useQuietHours — reactive wrapper around the quiet-hours config
//
// A per-minute ticker re-evaluates `isQuiet` so Vue templates and watchers
// stay in sync as time passes.
//
// Single shared module-scoped state keeps the interval running only when at
// least one component is mounted.
//
// Usage (in a Vue component):
//   const { config, isQuiet, update } = useQuietHours()
//
// Usage (outside Vue, e.g. useNotificationBadge):
//   import { isQuietNow } from '@/composables/useQuietHours'
//   if (!isQuietNow()) { ... }
// ---------------------------------------------------------------------------

import { ref, computed, onMounted, onUnmounted } from 'vue'
import {
  loadConfig,
  saveConfig as persistConfig,
  isInQuietHours,
  type QuietHoursConfig,
} from '@/utils/quietHours'

// ---------------------------------------------------------------------------
// Module-scoped shared state
// ---------------------------------------------------------------------------

const config = ref<QuietHoursConfig>(loadConfig())
const tickNow = ref(Date.now())

let intervalId: ReturnType<typeof setInterval> | null = null
let consumers = 0

// ---------------------------------------------------------------------------
// Public composable
// ---------------------------------------------------------------------------

export function useQuietHours() {
  onMounted(() => {
    consumers++
    if (consumers === 1) {
      // Start per-minute clock tick when the first consumer mounts
      intervalId = setInterval(() => {
        tickNow.value = Date.now()
      }, 60_000)
    }
  })

  onUnmounted(() => {
    consumers--
    if (consumers === 0 && intervalId !== null) {
      clearInterval(intervalId)
      intervalId = null
    }
  })

  return {
    config: computed(() => config.value),
    isQuiet: computed(() => isInQuietHours(config.value, new Date(tickNow.value))),
    update: (next: QuietHoursConfig): void => {
      config.value = { ...next }
      persistConfig(next)
    },
  }
}

// ---------------------------------------------------------------------------
// Non-Vue helper — for callers that cannot use composable lifecycle hooks
// (e.g. useNotificationBadge which lives outside component setup)
// ---------------------------------------------------------------------------

/** Returns true if the current moment falls within quiet hours. */
export function isQuietNow(): boolean {
  return isInQuietHours(config.value, new Date())
}

// ---------------------------------------------------------------------------
// Test helpers — allow resetting module state between tests
// ---------------------------------------------------------------------------

/** @internal — for tests only */
export function _resetQuietHoursState(): void {
  consumers = 0
  if (intervalId !== null) {
    clearInterval(intervalId)
    intervalId = null
  }
  config.value = loadConfig()
  tickNow.value = Date.now()
}
