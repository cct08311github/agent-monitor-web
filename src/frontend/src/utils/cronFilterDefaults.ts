// ---------------------------------------------------------------------------
// cronFilterDefaults.ts — shared filter defaults and active-filter detection
// for CronTab.
// Mirrors the pattern from captureFilterDefaults.ts (#591).
// ---------------------------------------------------------------------------

export const CRON_FILTER_DEFAULTS = {
  searchQuery: '',
  selectedTag: null as string | null,
  filterMode: 'all' as 'all' | 'enabled' | 'disabled',
  showArchived: false,
  pinnedOnly: false,
} as const

export interface CronFilterState {
  searchQuery: string
  selectedTag: string | null
  filterMode: 'all' | 'enabled' | 'disabled'
  showArchived: boolean
  pinnedOnly: boolean
}

/**
 * Returns true when any cron filter deviates from its default value.
 * Whitespace-only searchQuery is treated as empty (same as default).
 */
export function hasActiveCronFilters(state: CronFilterState): boolean {
  return (
    state.searchQuery.trim() !== CRON_FILTER_DEFAULTS.searchQuery
    || state.selectedTag !== CRON_FILTER_DEFAULTS.selectedTag
    || state.filterMode !== CRON_FILTER_DEFAULTS.filterMode
    || state.showArchived !== CRON_FILTER_DEFAULTS.showArchived
    || state.pinnedOnly !== CRON_FILTER_DEFAULTS.pinnedOnly
  )
}
