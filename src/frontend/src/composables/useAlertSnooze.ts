// ---------------------------------------------------------------------------
// useAlertSnooze — module-scoped composable for alert snooze state.
//
// Module-scoped shared state (like useToast) so all consumers see the same
// snooze map and the cleanup interval is shared.
// ---------------------------------------------------------------------------

import { ref, computed, onMounted, onUnmounted } from 'vue'
import {
  loadSnoozes,
  saveSnoozes,
  snoozeAlert as snoozeUtil,
  unsnoozeAlert as unsnoozeUtil,
  pruneExpired,
  type SnoozeEntry,
} from '@/utils/alertSnooze'

// Module-scoped shared state
const snoozes = ref<Map<string, SnoozeEntry>>(new Map())
const tickNow = ref(Date.now())

let intervalId: ReturnType<typeof setInterval> | null = null
let consumers = 0

// Load initial state from localStorage once when the module is first imported
snoozes.value = loadSnoozes()

export function useAlertSnooze() {
  onMounted(() => {
    consumers++
    if (consumers === 1) {
      intervalId = setInterval(() => {
        tickNow.value = Date.now()
        const pruned = pruneExpired(snoozes.value, tickNow.value)
        if (pruned.size !== snoozes.value.size) {
          snoozes.value = pruned
          saveSnoozes(pruned)
        }
      }, 30_000)
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
    snoozes: computed(() => snoozes.value),
    now: computed(() => tickNow.value),

    snooze: (alertId: string, durationMs: number): SnoozeEntry => {
      const entry = snoozeUtil(alertId, durationMs, Date.now())
      snoozes.value = new Map(snoozes.value).set(alertId, entry)
      return entry
    },

    unsnooze: (alertId: string): void => {
      unsnoozeUtil(alertId)
      const next = new Map(snoozes.value)
      next.delete(alertId)
      snoozes.value = next
    },
  }
}
