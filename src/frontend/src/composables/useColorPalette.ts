// ---------------------------------------------------------------------------
// useColorPalette — module-scoped reactive palette state
//
// The module-level `palette` ref is shared across all callers (singleton),
// mirroring the pattern used by useTheme / useToast.
//
// Boot-time bootstrap:
//   import { bootstrapPalette } from '@/composables/useColorPalette'
//   bootstrapPalette() — call once in App.vue (onMounted or top-level setup)
// ---------------------------------------------------------------------------

import { ref, readonly } from 'vue'
import {
  loadPalette,
  savePalette,
  applyPalette,
  type PaletteName,
} from '@/utils/colorPalette'

// Module-scoped singleton state
const palette = ref<PaletteName>(loadPalette())

export function useColorPalette() {
  function isCbSafe(): boolean {
    return palette.value === 'cb-safe'
  }

  function setPalette(p: PaletteName): void {
    palette.value = p
    savePalette(p)
    applyPalette(p)
  }

  function togglePalette(): void {
    const next: PaletteName = palette.value === 'cb-safe' ? 'default' : 'cb-safe'
    palette.value = next
    savePalette(next)
    applyPalette(next)
  }

  return {
    palette: readonly(palette),
    isCbSafe,
    setPalette,
    togglePalette,
  }
}

/**
 * Boot-time helper — call once in App.vue to apply the persisted palette
 * immediately on page load (before any reactivity waterfall runs).
 */
export function bootstrapPalette(): void {
  applyPalette(palette.value)
}
