// ---------------------------------------------------------------------------
// useThemeSchedule — reactive composable that applies auto theme switching
// based on a configurable time schedule.
//
// Manual-override semantics:
//   - On each tick, if expectedTheme(config, now) !== lastBoundaryTheme, a
//     boundary crossing has occurred → apply the new theme and record it in
//     lastBoundaryTheme.
//   - If the user manually presses T after a boundary application, useTheme's
//     currentTheme changes but lastBoundaryTheme stays at what we last set.
//     The composable will NOT override the user's choice again until the NEXT
//     boundary crossing (when expectedTheme changes again).
//
// Singleton-style module state: a single interval is shared across all
// mounted consumers; the interval is cleared when the last consumer unmounts.
//
// Usage (App.vue — just install the ticker):
//   useThemeSchedule()
//
// Usage (ThemeScheduleSetting.vue — update config):
//   const { config, isEnabled, update } = useThemeSchedule()
// ---------------------------------------------------------------------------

import { ref, computed, onMounted, onUnmounted } from 'vue'
import {
  loadConfig,
  saveConfig,
  expectedTheme,
  type ThemeScheduleConfig,
  type ScheduleTheme,
} from '@/utils/themeSchedule'
import { useTheme } from '@/composables/useTheme'

// ---------------------------------------------------------------------------
// Module-scoped shared state
// ---------------------------------------------------------------------------

const config = ref<ThemeScheduleConfig>(loadConfig())

/**
 * Tracks the last theme we applied via a scheduled boundary crossing.
 * null = no boundary applied yet in this session.
 */
const lastBoundaryTheme = ref<ScheduleTheme | null>(null)

let intervalId: ReturnType<typeof setInterval> | null = null
let consumers = 0

// ---------------------------------------------------------------------------
// Tick logic (module-level, not per-composable-instance)
// ---------------------------------------------------------------------------

function tick(): void {
  const { setTheme } = useTheme()
  const exp = expectedTheme(config.value, new Date())
  if (!exp) return

  // Apply only on boundary crossing: when expected differs from last applied.
  // This lets manual T-key overrides survive until the next crossing.
  if (exp !== lastBoundaryTheme.value) {
    setTheme(exp)
    lastBoundaryTheme.value = exp
  }
}

// ---------------------------------------------------------------------------
// Public composable
// ---------------------------------------------------------------------------

export function useThemeSchedule() {
  onMounted(() => {
    consumers++
    if (consumers === 1) {
      // Apply immediately on first mount (respects boundary semantics)
      tick()
      intervalId = setInterval(tick, 60_000)
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
    isEnabled: computed(() => config.value.enabled),
    update(next: ThemeScheduleConfig): void {
      config.value = { ...next }
      saveConfig(next)
      // Reset boundary so next tick re-evaluates from scratch
      lastBoundaryTheme.value = null
      tick()
    },
  }
}

// ---------------------------------------------------------------------------
// Test helpers — allow resetting module state between tests
// ---------------------------------------------------------------------------

/** @internal — for tests only */
export function _resetThemeScheduleState(): void {
  consumers = 0
  if (intervalId !== null) {
    clearInterval(intervalId)
    intervalId = null
  }
  config.value = loadConfig()
  lastBoundaryTheme.value = null
}
