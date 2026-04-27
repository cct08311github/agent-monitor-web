// ---------------------------------------------------------------------------
// captureFilterDefaults.ts — shared filter defaults and active-filter detection
// for QuickCaptureList.
// ---------------------------------------------------------------------------

import type { DateRangeState } from './captureDateFilter'
import type { SortOrder } from './captureSortPref'

export const FILTER_DEFAULTS = {
  searchQuery: '',
  selectedTag: null as string | null,
  selectedContext: null as string | null,
  dateRangeState: { range: 'all' } as DateRangeState,
  sortOrder: 'desc' as SortOrder,
  pinnedOnly: false,
} as const

export interface FilterState {
  searchQuery: string
  selectedTag: string | null
  selectedContext: string | null
  dateRangeState: DateRangeState
  sortOrder: SortOrder
  pinnedOnly: boolean
}

/**
 * Returns true when any filter deviates from its default value.
 * Whitespace-only searchQuery is treated as empty (same as default).
 */
export function hasActiveFilters(state: FilterState): boolean {
  return (
    state.searchQuery.trim() !== FILTER_DEFAULTS.searchQuery
    || state.selectedTag !== FILTER_DEFAULTS.selectedTag
    || state.selectedContext !== FILTER_DEFAULTS.selectedContext
    || state.dateRangeState.range !== 'all'
    || state.sortOrder !== FILTER_DEFAULTS.sortOrder
    || state.pinnedOnly !== FILTER_DEFAULTS.pinnedOnly
  )
}
