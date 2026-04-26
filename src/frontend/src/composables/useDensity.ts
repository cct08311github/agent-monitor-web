// ---------------------------------------------------------------------------
// useDensity — reactive density preference composable
//
// Wraps densityPref utilities with a shared Vue ref so all consumers
// react to density changes without additional event wiring.
// ---------------------------------------------------------------------------

import { ref } from 'vue'
import {
  loadDensity,
  saveDensity,
  applyDensity,
  type DensityMode,
} from '@/utils/densityPref'

const density = ref<DensityMode>(loadDensity())

export function useDensity() {
  return {
    density,
    isCompact: () => density.value === 'compact',
    setDensity(d: DensityMode) {
      density.value = d
      saveDensity(d)
      applyDensity(d)
    },
    toggleDensity() {
      const next: DensityMode = density.value === 'compact' ? 'comfortable' : 'compact'
      density.value = next
      saveDensity(next)
      applyDensity(next)
    },
  }
}

export function bootstrapDensity(): void {
  applyDensity(density.value)
}
