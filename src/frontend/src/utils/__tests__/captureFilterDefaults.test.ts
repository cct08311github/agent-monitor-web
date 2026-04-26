import { describe, it, expect } from 'vitest'
import { FILTER_DEFAULTS, hasActiveFilters } from '../captureFilterDefaults'
import type { FilterState } from '../captureFilterDefaults'

const defaults: FilterState = {
  searchQuery: FILTER_DEFAULTS.searchQuery,
  selectedTag: FILTER_DEFAULTS.selectedTag,
  dateRange: FILTER_DEFAULTS.dateRange,
  sortOrder: FILTER_DEFAULTS.sortOrder,
}

describe('FILTER_DEFAULTS', () => {
  it('has all 4 expected keys', () => {
    expect(FILTER_DEFAULTS).toHaveProperty('searchQuery')
    expect(FILTER_DEFAULTS).toHaveProperty('selectedTag')
    expect(FILTER_DEFAULTS).toHaveProperty('dateRange')
    expect(FILTER_DEFAULTS).toHaveProperty('sortOrder')
  })

  it('searchQuery default is empty string', () => {
    expect(FILTER_DEFAULTS.searchQuery).toBe('')
  })

  it('selectedTag default is null', () => {
    expect(FILTER_DEFAULTS.selectedTag).toBeNull()
  })

  it('dateRange default is "all"', () => {
    expect(FILTER_DEFAULTS.dateRange).toBe('all')
  })

  it('sortOrder default is "desc"', () => {
    expect(FILTER_DEFAULTS.sortOrder).toBe('desc')
  })
})

describe('hasActiveFilters', () => {
  it('returns false when all filters are at defaults', () => {
    expect(hasActiveFilters(defaults)).toBe(false)
  })

  it('returns false when searchQuery is whitespace-only (treated as empty)', () => {
    expect(hasActiveFilters({ ...defaults, searchQuery: '   ' })).toBe(false)
  })

  it('returns true when searchQuery is non-empty', () => {
    expect(hasActiveFilters({ ...defaults, searchQuery: 'hello' })).toBe(true)
  })

  it('returns true when selectedTag is set', () => {
    expect(hasActiveFilters({ ...defaults, selectedTag: 'work' })).toBe(true)
  })

  it('returns true when dateRange is not "all"', () => {
    expect(hasActiveFilters({ ...defaults, dateRange: 'today' })).toBe(true)
    expect(hasActiveFilters({ ...defaults, dateRange: 'last7d' })).toBe(true)
    expect(hasActiveFilters({ ...defaults, dateRange: 'last30d' })).toBe(true)
    expect(hasActiveFilters({ ...defaults, dateRange: 'yesterday' })).toBe(true)
  })

  it('returns true when sortOrder is not "desc"', () => {
    expect(hasActiveFilters({ ...defaults, sortOrder: 'asc' })).toBe(true)
  })

  it('returns true when multiple filters deviate from defaults', () => {
    expect(
      hasActiveFilters({ searchQuery: 'test', selectedTag: 'vue', dateRange: 'today', sortOrder: 'asc' }),
    ).toBe(true)
  })
})
