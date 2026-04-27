import { describe, it, expect } from 'vitest'
import { CRON_FILTER_DEFAULTS, hasActiveCronFilters } from '../cronFilterDefaults'
import type { CronFilterState } from '../cronFilterDefaults'

const defaults: CronFilterState = {
  searchQuery: CRON_FILTER_DEFAULTS.searchQuery,
  selectedTag: CRON_FILTER_DEFAULTS.selectedTag,
  filterMode: CRON_FILTER_DEFAULTS.filterMode,
  showArchived: CRON_FILTER_DEFAULTS.showArchived,
  pinnedOnly: CRON_FILTER_DEFAULTS.pinnedOnly,
}

describe('CRON_FILTER_DEFAULTS', () => {
  it('has all 5 expected keys', () => {
    expect(CRON_FILTER_DEFAULTS).toHaveProperty('searchQuery')
    expect(CRON_FILTER_DEFAULTS).toHaveProperty('selectedTag')
    expect(CRON_FILTER_DEFAULTS).toHaveProperty('filterMode')
    expect(CRON_FILTER_DEFAULTS).toHaveProperty('showArchived')
    expect(CRON_FILTER_DEFAULTS).toHaveProperty('pinnedOnly')
  })

  it('searchQuery default is empty string', () => {
    expect(CRON_FILTER_DEFAULTS.searchQuery).toBe('')
  })

  it('selectedTag default is null', () => {
    expect(CRON_FILTER_DEFAULTS.selectedTag).toBeNull()
  })

  it('filterMode default is "all"', () => {
    expect(CRON_FILTER_DEFAULTS.filterMode).toBe('all')
  })

  it('showArchived default is false', () => {
    expect(CRON_FILTER_DEFAULTS.showArchived).toBe(false)
  })

  it('pinnedOnly default is false', () => {
    expect(CRON_FILTER_DEFAULTS.pinnedOnly).toBe(false)
  })
})

describe('hasActiveCronFilters', () => {
  it('returns false when all filters are at defaults', () => {
    expect(hasActiveCronFilters(defaults)).toBe(false)
  })

  it('returns false when searchQuery is whitespace-only (treated as empty)', () => {
    expect(hasActiveCronFilters({ ...defaults, searchQuery: '   ' })).toBe(false)
  })

  it('returns true when searchQuery is non-empty', () => {
    expect(hasActiveCronFilters({ ...defaults, searchQuery: 'backup' })).toBe(true)
  })

  it('returns true when selectedTag is set', () => {
    expect(hasActiveCronFilters({ ...defaults, selectedTag: 'daily' })).toBe(true)
  })

  it('returns true when filterMode is "enabled"', () => {
    expect(hasActiveCronFilters({ ...defaults, filterMode: 'enabled' })).toBe(true)
  })

  it('returns true when filterMode is "disabled"', () => {
    expect(hasActiveCronFilters({ ...defaults, filterMode: 'disabled' })).toBe(true)
  })

  it('returns true when showArchived is true', () => {
    expect(hasActiveCronFilters({ ...defaults, showArchived: true })).toBe(true)
  })

  it('returns true when pinnedOnly is true', () => {
    expect(hasActiveCronFilters({ ...defaults, pinnedOnly: true })).toBe(true)
  })

  it('returns false when pinnedOnly is false (at default)', () => {
    expect(hasActiveCronFilters({ ...defaults, pinnedOnly: false })).toBe(false)
  })

  it('returns true when multiple filters deviate from defaults including pinnedOnly', () => {
    expect(
      hasActiveCronFilters({
        searchQuery: 'nightly',
        selectedTag: 'ci',
        filterMode: 'enabled',
        showArchived: true,
        pinnedOnly: true,
      }),
    ).toBe(true)
  })

  it('returns true when multiple filters deviate from defaults', () => {
    expect(
      hasActiveCronFilters({
        searchQuery: 'nightly',
        selectedTag: 'ci',
        filterMode: 'enabled',
        showArchived: true,
        pinnedOnly: false,
      }),
    ).toBe(true)
  })
})
