// ---------------------------------------------------------------------------
// captureFilterDefaults.ts — shared filter defaults and active-filter detection
// for QuickCaptureList.
// ---------------------------------------------------------------------------

import type { DateRange } from './captureDateFilter'
import type { SortOrder } from './captureSortPref'

export const FILTER_DEFAULTS = {
  searchQuery: '',
  selectedTag: null as string | null,
  dateRange: 'all' as DateRange,
  sortOrder: 'desc' as SortOrder,
} as const

export interface FilterState {
  searchQuery: string
  selectedTag: string | null
  dateRange: DateRange
  sortOrder: SortOrder
}

/**
 * Returns true when any filter deviates from its default value.
 * Whitespace-only searchQuery is treated as empty (same as default).
 */
export function hasActiveFilters(state: FilterState): boolean {
  return (
    state.searchQuery.trim() !== FILTER_DEFAULTS.searchQuery
    || state.selectedTag !== FILTER_DEFAULTS.selectedTag
    || state.dateRange !== FILTER_DEFAULTS.dateRange
    || state.sortOrder !== FILTER_DEFAULTS.sortOrder
  )
}
