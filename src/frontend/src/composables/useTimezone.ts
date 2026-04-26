import { ref, computed } from 'vue'
import { loadMode, saveMode, type TimezoneMode } from '@/utils/timezonePref'
import { formatTimestamp as formatUtil, type FormatOptions } from '@/utils/formatTimestamp'

// Module-scoped reactive state — shared across all composable consumers
const mode = ref<TimezoneMode>(loadMode())

export function useTimezone() {
  return {
    mode: computed(() => mode.value),
    setMode: (m: TimezoneMode) => {
      mode.value = m
      saveMode(m)
    },
    toggle: () => {
      const next: TimezoneMode = mode.value === 'utc' ? 'local' : 'utc'
      mode.value = next
      saveMode(next)
    },
    format: (ts: number | Date, opts?: Omit<FormatOptions, 'mode'>) =>
      formatUtil(ts, { mode: mode.value, ...opts }),
  }
}
